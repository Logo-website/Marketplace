from rest_framework import serializers
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import User, Address, SellerProfile
from .validators import validate_password_strength, validate_inn

# Параметры фигуры (Ф10): числовые поля с диапазоном + размер одежды строкой.
# Диапазоны защищают от абсурда (рост 5 см) и нечисловых значений (граничный
# случай плана). Потребитель - подбор размера Ф5.
BODY_PARAM_RANGES = {
    'height': (100, 250),   # рост, см
    'chest': (40, 200),     # обхват груди, см
    'waist': (40, 200),     # обхват талии, см
    'hips': (40, 200),      # обхват бёдер, см
    'shoe_size': (30, 55),  # размер обуви (EU)
}
BODY_PARAM_STRINGS = {'clothing_size'}  # «M», «48» и т.п. - короткая строка

# Настройки рассылок (Ф10): только эти ключи, только bool. Хранение здесь,
# реальная отправка - Ф25.
NOTIFICATION_KEYS = {
    'orders_email', 'orders_push',
    'promos_email', 'promos_push',
    'price_email', 'price_push',
}


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['email', 'username', 'password']

    def validate_password(self, value):
        return validate_password_strength(value)

    def validate_email(self, value):
        if User.objects.filter(email=value.lower()).exists():
            raise serializers.ValidationError('Пользователь с таким email уже существует')
        return value.lower()

    def create(self, validated_data):
        validated_data['role'] = User.ROLE_BUYER
        user = User.objects.create_user(**validated_data)
        return user


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'username', 'phone', 'role', 'avatar',
                  'shop_name', 'body_params', 'notification_prefs']
        read_only_fields = ['role']

    def validate_body_params(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('Ожидается объект параметров')
        cleaned = {}
        for key, raw in value.items():
            if raw in (None, ''):
                continue  # пустое - очистка поля, допустимо (параметры необязательны)
            if key in BODY_PARAM_RANGES:
                try:
                    num = float(raw)
                except (TypeError, ValueError):
                    raise serializers.ValidationError(f'{key}: ожидается число')
                lo, hi = BODY_PARAM_RANGES[key]
                if not (lo <= num <= hi):
                    raise serializers.ValidationError(f'{key}: значение вне диапазона {lo}-{hi}')
                cleaned[key] = num
            elif key in BODY_PARAM_STRINGS:
                s = str(raw).strip()
                if len(s) > 20:
                    raise serializers.ValidationError(f'{key}: слишком длинное значение')
                cleaned[key] = s
            else:
                raise serializers.ValidationError(f'Неизвестный параметр: {key}')
        return cleaned

    def validate_notification_prefs(self, value):
        if not isinstance(value, dict):
            raise serializers.ValidationError('Ожидается объект настроек')
        cleaned = {}
        for key, raw in value.items():
            if key not in NOTIFICATION_KEYS:
                raise serializers.ValidationError(f'Неизвестная настройка: {key}')
            if not isinstance(raw, bool):
                raise serializers.ValidationError(f'{key}: ожидается true/false')
            cleaned[key] = raw
        return cleaned


class AddressSerializer(serializers.ModelSerializer):
    class Meta:
        model = Address
        fields = ['id', 'full_name', 'phone', 'city', 'street', 'house',
                  'apartment', 'postal_code', 'is_default', 'created_at']
        read_only_fields = ['id', 'created_at']

    def validate_phone(self, value):
        v = (value or '').strip()
        if not v:
            raise serializers.ValidationError('Укажите телефон')
        return v


class SellerProfileSerializer(serializers.ModelSerializer):
    """Профиль продавца (Ф11). PII (inn/bank_*/legal_name) - только здесь и
    только владельцу; в публичных сериализаторах их нет. shop_name живёт на User
    (его читает каталог), сюда подтягивается через source - запись/чтение
    названия витрины не теряется между моделями."""
    # Название витрины хранится на User.shop_name (non-PII, нужно каталогу).
    shop_name = serializers.CharField(source='user.shop_name', required=False,
                                      allow_blank=True, max_length=120)

    class Meta:
        model = SellerProfile
        # shop_banner (Ф20) редактируется тем же механизмом, что shop_logo -
        # иначе заведённое для витрины бренда поле баннера было бы мёртвым
        # (SellerProfile в admin read-only). Ф20 его только показывает.
        fields = ['legal_status', 'legal_name', 'inn', 'bank_account', 'bank_bik',
                  'shop_name', 'shop_description', 'shop_logo', 'shop_banner', 'tariff',
                  'offer_accepted', 'offer_accepted_at', 'status',
                  'created_at', 'updated_at']
        # status/role меняются только через активацию (сервер-инвариант),
        # время принятия оферты ставит сервер - клиент их не пишет.
        read_only_fields = ['offer_accepted_at', 'status', 'created_at', 'updated_at']

    def validate(self, attrs):
        # ИНН валидируем вместе с legal_status (длина зависит от статуса). При
        # PATCH недостающее берём из текущего профиля. Невалидный формат -> 400
        # на поле inn; пустой ИНН (черновик) не проверяем - это неполнота, не ошибка.
        inn = attrs.get('inn')
        legal_status = attrs.get('legal_status')
        if self.instance:
            inn = self.instance.inn if inn is None else inn
            legal_status = self.instance.legal_status if legal_status is None else legal_status
        if str(inn or '').strip() and str(legal_status or '').strip():
            try:
                attrs['inn'] = validate_inn(inn, legal_status)
            except serializers.ValidationError as e:
                raise serializers.ValidationError({'inn': e.detail})
        return attrs


class PasswordChangeSerializer(serializers.Serializer):
    """Смена пароля залогиненным (Ф10). Старый OTP-сброс - для забытого пароля;
    здесь смена «старый -> новый» без OTP, та же парольная политика (S6)."""
    old_password = serializers.CharField(write_only=True)
    new_password = serializers.CharField(write_only=True)
    new_password_confirm = serializers.CharField(write_only=True)

    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Неверный текущий пароль')
        return value

    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({'new_password_confirm': 'Пароли не совпадают'})
        # Единый валидатор - та же политика, что регистрация и сброс (S6).
        validate_password_strength(attrs['new_password'], self.context['request'].user)
        return attrs

    def save(self):
        user = self.context['request'].user
        user.set_password(self.validated_data['new_password'])
        user.save(update_fields=['password'])
        return user


class CustomTokenObtainPairSerializer(TokenObtainPairSerializer):
    username_field = 'email'