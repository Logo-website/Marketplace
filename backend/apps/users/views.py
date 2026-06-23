import resend
import logging
from rest_framework import generics, permissions, serializers, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from django.db import transaction
from django.contrib.auth import authenticate
from django.contrib.auth.hashers import make_password
from django.conf import settings
from django.utils import timezone
from .serializers import (
    RegisterSerializer, UserSerializer, CustomTokenObtainPairSerializer,
    AddressSerializer, PasswordChangeSerializer, SellerProfileSerializer,
)
from .models import User, OTPCode, MAX_OTP_ATTEMPTS, Address, SellerProfile
from .validators import (
    validate_password_strength, is_onboarding_complete, ONBOARDING_REQUIRED_FIELDS,
)
from .throttling import (
    LoginRateThrottle, RegisterRateThrottle,
    VerifyRateThrottle, PasswordResetRequestThrottle,
)

logger = logging.getLogger(__name__)


def consume_otp(email, code, action=None):
    """Проверка и атомарное гашение OTP-кода (S3 + S10).

    Возвращает (otp, None) при успехе или (None, Response) с ошибкой.
    - Неверный код инкрементирует attempts; при >= MAX_OTP_ATTEMPTS код
      инвалидируется (анти-брутфорс).
    - Верный код гасится атомарным UPDATE с проверкой rowcount - два
      параллельных запроса с одним кодом не пройдут оба (защита от гонки).
    """
    otp = OTPCode.objects.filter(email=email, is_used=False).order_by('-created_at').first()
    if not otp or not otp.is_valid():
        return None, Response({'error': 'Неверный или истёкший код'}, status=400)

    if otp.code != code:
        otp.attempts += 1
        if otp.attempts >= MAX_OTP_ATTEMPTS:
            otp.is_used = True
        otp.save(update_fields=['attempts', 'is_used'])
        return None, Response({'error': 'Неверный или истёкший код'}, status=400)

    if action is not None and otp.data.get('action') != action:
        return None, Response({'error': 'Неверный код'}, status=400)

    claimed = OTPCode.objects.filter(id=otp.id, is_used=False).update(is_used=True)
    if not claimed:
        # Код уже погашен параллельным запросом
        return None, Response({'error': 'Неверный или истёкший код'}, status=400)

    return otp, None


def send_otp_email(email, code, subject, heading):
    resend.api_key = settings.RESEND_API_KEY
    resend.Emails.send({
        'from': settings.DEFAULT_FROM_EMAIL,
        'to': [email],
        'subject': subject,
        'html': f'''
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto;">
                <h2 style="color: #111;">{heading}</h2>
                <p>Ваш код подтверждения:</p>
                <div style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #6366f1; margin: 20px 0;">
                    {code}
                </div>
                <p style="color: #666;">Код действителен 10 минут.</p>
                <hr style="border: none; border-top: 1px solid #eee;">
                <p style="color: #999; font-size: 12px;">Marketplace</p>
            </div>
        ''',
    })


class RegisterRequestView(APIView):
    """Шаг 1 — принимаем данные, отправляем код на почту."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [RegisterRateThrottle]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)

        data = serializer.validated_data
        email = data['email']

        otp = OTPCode.generate(email, {
            'email': email,
            'username': data['username'],
            # храним ХЕШ, а не сырой пароль: утечка БД не раскроет пароли (S1)
            'password': make_password(data['password']),
            'role': 'buyer',
        })

        try:
            send_otp_email(
                email, otp.code,
                'Код подтверждения — Marketplace',
                'Подтвердите регистрацию'
            )
        except Exception as e:
            logger.error(f'Resend error (register): {e}')
            return Response({'error': 'Ошибка отправки кода. Попробуйте позже.'}, status=500)

        return Response({'detail': 'Код отправлен на почту', 'email': email})


class RegisterVerifyView(APIView):
    """Шаг 2 — проверяем код и создаём пользователя."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [VerifyRateThrottle]

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        code = request.data.get('code', '').strip()

        if not email or not code:
            return Response({'error': 'Укажите email и код'}, status=400)

        otp, error = consume_otp(email, code)
        if error:
            return error

        data = otp.data
        try:
            # password в data - уже хеш (make_password на шаге request),
            # поэтому присваиваем напрямую, без повторного set_password
            user = User(
                email=data['email'],
                username=data['username'],
                role=data.get('role', 'buyer'),
            )
            user.password = data['password']
            user.save()
        except Exception as e:
            logger.error(f'User creation error: {e}')
            return Response({'error': 'Ошибка создания аккаунта'}, status=400)

        refresh = RefreshToken.for_user(user)
        return Response({
            'detail': 'Аккаунт создан',
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }, status=201)


class LoginRequestView(APIView):
    """Шаг 1 входа — проверяем пароль, отправляем OTP."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [LoginRateThrottle]

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '')

        if not email or not password:
            return Response({'error': 'Укажите email и пароль'}, status=400)

        try:
            user_obj = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response({'error': 'Неверный логин или пароль'}, status=400)

        user = authenticate(request, email=email, password=password)
        if not user:
            return Response({'error': 'Неверный логин или пароль'}, status=400)

        otp = OTPCode.generate(email, {'user_id': user.id})

        try:
            send_otp_email(
                email, otp.code,
                'Код входа — Marketplace',
                'Подтвердите вход'
            )
        except Exception as e:
            logger.error(f'Resend error (login): {e}')
            return Response({'error': 'Ошибка отправки кода. Попробуйте позже.'}, status=500)

        return Response({'detail': 'Код отправлен на почту', 'email': email})


class LoginVerifyView(APIView):
    """Шаг 2 входа — проверяем OTP, возвращаем JWT."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [VerifyRateThrottle]

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        code = request.data.get('code', '').strip()

        if not email or not code:
            return Response({'error': 'Укажите email и код'}, status=400)

        otp, error = consume_otp(email, code)
        if error:
            return error

        user_id = otp.data.get('user_id')
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'Пользователь не найден'}, status=400)

        # Enforcement блокировки (Ф19): authenticate() на шаге 1 уже отсекает
        # неактивных, но OTP мог быть выдан ДО блокировки - тогда выдавать токены
        # нельзя (иначе заблокированный «логинится», пусть и мёртвыми токенами).
        if not user.is_active:
            return Response({'error': 'Аккаунт заблокирован'}, status=403)

        refresh = RefreshToken.for_user(user)
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        })


class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_object(self):
        return self.request.user

    def get_queryset(self):
        return User.objects.filter(pk=self.request.user.pk)


class PasswordChangeView(APIView):
    """Смена пароля залогиненным пользователем (Ф10)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = PasswordChangeSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response({'detail': 'Пароль успешно изменён'})


class AddressViewSet(viewsets.ModelViewSet):
    """CRUD адресов доставки (Ф10). Только адреса владельца (S: персданные)."""
    serializer_class = AddressSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Address.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        with transaction.atomic():
            address = serializer.save(user=self.request.user)
            self._sync_default(address)

    def perform_update(self, serializer):
        with transaction.atomic():
            address = serializer.save()
            self._sync_default(address)

    def _sync_default(self, address):
        """Ровно один is_default на пользователя: при установке снимаем флаг с
        прочих; если у пользователя нет ни одного дефолта - делаем дефолтным
        первый (этот) адрес, чтобы выбор по умолчанию всегда существовал."""
        qs = Address.objects.filter(user=address.user)
        if address.is_default:
            qs.exclude(pk=address.pk).filter(is_default=True).update(is_default=False)
        elif not qs.filter(is_default=True).exists():
            Address.objects.filter(pk=address.pk).update(is_default=True)
            # Синхронизируем in-memory объект - иначе ответ POST/PUT отдаст
            # is_default=False, хотя в БД уже True.
            address.is_default = True

    def perform_destroy(self, instance):
        was_default = instance.is_default
        user = instance.user
        instance.delete()
        # Удалили дефолтный - назначаем дефолтом самый свежий из оставшихся,
        # чтобы пользователь не остался без адреса по умолчанию.
        if was_default:
            fallback = Address.objects.filter(user=user).first()
            if fallback:
                Address.objects.filter(pk=fallback.pk).update(is_default=True)


def _apply_seller_fields(profile, validated, user):
    """Переносит проверенные данные на профиль + кросс-модельно на User.shop_name.
    Время принятия оферты ставит сервер ровно один раз (при первом принятии)."""
    user_data = validated.pop('user', {})
    if validated.get('offer_accepted') and not profile.offer_accepted_at:
        profile.offer_accepted_at = timezone.now()
    for field, value in validated.items():
        setattr(profile, field, value)
    # shop_name приходит вложенным (source='user.shop_name') - пишем на User.
    if 'shop_name' in user_data:
        user.shop_name = user_data['shop_name']


def _profile_is_complete(profile):
    """Комплект полон по текущему состоянию профиля - единый критерий активации."""
    data = {f: getattr(profile, f) for f in ONBOARDING_REQUIRED_FIELDS}
    data['offer_accepted'] = profile.offer_accepted
    return is_onboarding_complete(data)


class SellerOnboardingView(APIView):
    """POST /auth/seller/onboarding/ - заявка «стать продавцом» (Ф11).

    Невалидный формат поля -> 400, ничего не пишем. Валидно, но комплект неполный
    -> 200 с черновиком (status=incomplete, роль не меняется). Полный комплект ->
    в одной транзакции status=active + role=seller (флип ТОЛЬКО из buyer)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        # partial=True: валидируем только присланные поля, без инъекции дефолтов
        # (иначе повторный POST затёр бы tariff/offer_accepted). 400 - до записи в БД.
        serializer = SellerProfileSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        validated = dict(serializer.validated_data)

        with transaction.atomic():
            profile, _ = SellerProfile.objects.get_or_create(user=request.user)
            _apply_seller_fields(profile, validated, request.user)
            if _profile_is_complete(profile):
                profile.status = SellerProfile.STATUS_ACTIVE
                # Роль флипаем исключительно из buyer: admin/seller не трогаем,
                # чтобы не сломать синхронизацию is_staff и не «понизить» админа.
                if request.user.role == User.ROLE_BUYER:
                    request.user.role = User.ROLE_SELLER
            profile.save()
            request.user.save()

        return Response(SellerProfileSerializer(profile).data, status=200)


class SellerProfileView(APIView):
    """GET/PATCH /auth/seller/profile/ - свой профиль и настройки магазина (Ф11).

    GET safe: нет профиля -> 404, черновик на GET не создаётся. PATCH - только
    активному продавцу; status/role read-only; нельзя обнулить обязательные поля."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            profile = request.user.seller_profile
        except SellerProfile.DoesNotExist:
            return Response({'detail': 'Профиль продавца не найден'}, status=404)
        return Response(SellerProfileSerializer(profile).data)

    def patch(self, request):
        try:
            profile = request.user.seller_profile
        except SellerProfile.DoesNotExist:
            return Response({'detail': 'Профиль продавца не найден'}, status=404)
        if profile.status != SellerProfile.STATUS_ACTIVE:
            return Response({'detail': 'Настройки доступны только активному продавцу'}, status=403)

        serializer = SellerProfileSerializer(profile, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        validated = dict(serializer.validated_data)

        # Инвариант полноты: активный магазин нельзя привести в неполное состояние.
        candidate = {f: validated.get(f, getattr(profile, f)) for f in ONBOARDING_REQUIRED_FIELDS}
        candidate['offer_accepted'] = validated.get('offer_accepted', profile.offer_accepted)
        if not is_onboarding_complete(candidate):
            return Response(
                {'detail': 'Нельзя очистить обязательные данные активного магазина'},
                status=400,
            )

        with transaction.atomic():
            _apply_seller_fields(profile, validated, request.user)
            profile.save()
            request.user.save()
        return Response(SellerProfileSerializer(profile).data)


class LogoutView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({'detail': 'Вы вышли из системы'})
        except TokenError:
            return Response({'error': 'Неверный токен'}, status=400)

class PasswordResetRequestView(APIView):
    """Шаг 1 — отправляем OTP код для сброса пароля."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [PasswordResetRequestThrottle]

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        if not email:
            return Response({'error': 'Укажите email'}, status=400)

        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # Не раскрываем что пользователь не существует
            return Response({'detail': 'Код отправлен на почту', 'email': email})

        otp = OTPCode.generate(email, {'user_id': user.id, 'action': 'reset_password'})

        try:
            send_otp_email(
                email, otp.code,
                'Сброс пароля — Marketplace',
                'Сброс пароля'
            )
        except Exception as e:
            logger.error(f'Resend error (reset): {e}')
            return Response({'error': 'Ошибка отправки кода. Попробуйте позже.'}, status=500)

        return Response({'detail': 'Код отправлен на почту', 'email': email})


class PasswordResetVerifyView(APIView):
    """Шаг 2 — проверяем OTP и меняем пароль."""
    permission_classes = [permissions.AllowAny]
    throttle_classes = [VerifyRateThrottle]

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        code = request.data.get('code', '').strip()
        password = request.data.get('password', '')
        password_confirm = request.data.get('password_confirm', '')

        if not all([email, code, password, password_confirm]):
            return Response({'error': 'Заполните все поля'}, status=400)

        if password != password_confirm:
            return Response({'error': 'Пароли не совпадают'}, status=400)

        # Единый валидатор пароля - та же политика, что при регистрации (S6)
        try:
            validate_password_strength(password)
        except serializers.ValidationError as e:
            return Response({'error': e.detail[0] if e.detail else 'Некорректный пароль'}, status=400)

        otp, error = consume_otp(email, code, action='reset_password')
        if error:
            return error

        try:
            user = User.objects.get(id=otp.data['user_id'])
            user.set_password(password)
            user.save()
        except Exception as e:
            logger.error(f'Password reset error: {e}')
            return Response({'error': 'Ошибка сброса пароля'}, status=400)

        return Response({'detail': 'Пароль успешно изменён'})