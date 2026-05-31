import resend
import logging
from rest_framework import generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.exceptions import TokenError
from django.contrib.auth import authenticate
from django.conf import settings
from .serializers import RegisterSerializer, UserSerializer, CustomTokenObtainPairSerializer
from .models import User, OTPCode
from .throttling import LoginRateThrottle, RegisterRateThrottle

logger = logging.getLogger(__name__)


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
            'password': data['password'],
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

    def post(self, request):
        email = request.data.get('email', '').strip()
        code = request.data.get('code', '').strip()

        if not email or not code:
            return Response({'error': 'Укажите email и код'}, status=400)

        otp = OTPCode.objects.filter(email=email, code=code, is_used=False).last()
        if not otp or not otp.is_valid():
            return Response({'error': 'Неверный или истёкший код'}, status=400)

        data = otp.data
        try:
            user = User.objects.create_user(
                email=data['email'],
                username=data['username'],
                password=data['password'],
                role=data.get('role', 'buyer'),
            )
            otp.is_used = True
            otp.save()
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

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        code = request.data.get('code', '').strip()

        if not email or not code:
            return Response({'error': 'Укажите email и код'}, status=400)

        otp = OTPCode.objects.filter(email=email, code=code, is_used=False).last()
        if not otp or not otp.is_valid():
            return Response({'error': 'Неверный или истёкший код'}, status=400)

        user_id = otp.data.get('user_id')
        try:
            user = User.objects.get(id=user_id)
        except User.DoesNotExist:
            return Response({'error': 'Пользователь не найден'}, status=400)

        otp.is_used = True
        otp.save()

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