from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
import secrets
from django.utils import timezone
from datetime import timedelta

# После скольких неверных попыток ввода код инвалидируется (анти-брутфорс)
MAX_OTP_ATTEMPTS = 5

class CustomUserManager(UserManager):
    """createsuperuser должен оставаться согласованным с ролевой моделью.
    Ниже (User.save) роль - единственный источник правды для is_staff/
    is_superuser: при role != admin суперправа снимаются. Стандартный
    create_superuser ставит is_superuser=True, но role оставляет default
    'buyer' - тогда save() тут же снял бы права, и бутстрап /admin/ сломался.
    Поэтому суперюзеру по умолчанию выставляем role=admin (инвариант
    is_superuser <-> role==admin держится в обе стороны)."""

    def create_superuser(self, *args, **kwargs):
        kwargs.setdefault('role', self.model.ROLE_ADMIN)
        return super().create_superuser(*args, **kwargs)


class User(AbstractUser):
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)
    # Публичное имя магазина/бренда продавца. Отдаётся в каталоге вместо email
    # (S17: email - персданные, не должен утекать анонимам). Non-PII.
    shop_name = models.CharField(max_length=120, blank=True)
    # Параметры фигуры (Ф10): рост/обхваты/размеры. JSON, а не колонки - набор
    # fashion-полей будет дополняться (потребитель - подбор размера Ф5), валидация
    # ключей/диапазонов в UserSerializer. Non-PII по сути, но личное.
    body_params = models.JSONField(default=dict, blank=True)
    # Настройки рассылок (Ф10): тумблеры по типам уведомлений. Хранение здесь,
    # реальная отправка - Ф25. Валидация ключей в UserSerializer.
    notification_prefs = models.JSONField(default=dict, blank=True)

    ROLE_BUYER = 'buyer'
    ROLE_SELLER = 'seller'
    ROLE_ADMIN = 'admin'

    ROLE_CHOICES = [
        (ROLE_BUYER, 'Покупатель'),
        (ROLE_SELLER, 'Продавец'),
        (ROLE_ADMIN, 'Администратор'),
    ]

    role = models.CharField(max_length=10, choices=ROLE_CHOICES, default=ROLE_BUYER)

    objects = CustomUserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def save(self, *args, **kwargs):
        # Роль - единственный источник правды для админ-привилегий (Ф19).
        # role=admin -> выдаём is_staff/is_superuser; любая другая роль -> снимаем.
        # Снятие (демоушен admin -> buyer/seller) закрывает дыру: раньше понижение
        # роли оставляло суперюзера с полным доступом к /admin/ (тихая эскалация).
        if self.role == self.ROLE_ADMIN:
            self.is_staff = True
            self.is_superuser = True
        else:
            self.is_staff = False
            self.is_superuser = False
        super().save(*args, **kwargs)

    def __str__(self):
        return self.email

class SellerProfile(models.Model):
    """Данные продавца (Ф11, узел 2.14). Отдельная модель, не поля на User:
    юр-статус/ИНН/реквизиты выплат - персданные (опасная тройка), а User уже
    отдаётся анонимам в каталоге (shop_name) и владельцу в /auth/profile/.
    PII живёт только здесь и отдаётся исключительно владельцу.

    Активация (status=active + user.role=seller) - серверный инвариант: только
    при полном комплекте (юр-данные + реквизиты + принятая оферта). Без
    реквизитов магазин не активируется (условие карты)."""

    LEGAL_SELF_EMPLOYED = 'self_employed'
    LEGAL_IP = 'ip'
    LEGAL_OOO = 'ooo'
    LEGAL_STATUS_CHOICES = [
        (LEGAL_SELF_EMPLOYED, 'Самозанятый'),
        (LEGAL_IP, 'Индивидуальный предприниматель'),
        (LEGAL_OOO, 'ООО'),
    ]

    # Тарифы Freemium (pricing.md). Коды провизорные, enum расширяемый под
    # будущие уровни; цены - LIVE, в код не хардкодим.
    TARIFF_FREE = 'free'
    TARIFF_ADVANCED = 'advanced'
    TARIFF_CHOICES = [
        (TARIFF_FREE, 'Базовый (бесплатный)'),
        (TARIFF_ADVANCED, 'Расширенный'),
    ]

    STATUS_INCOMPLETE = 'incomplete'
    STATUS_ACTIVE = 'active'
    STATUS_CHOICES = [
        (STATUS_INCOMPLETE, 'Черновик'),
        (STATUS_ACTIVE, 'Активен'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='seller_profile')
    legal_status = models.CharField(max_length=20, choices=LEGAL_STATUS_CHOICES, blank=True)
    legal_name = models.CharField(max_length=200, blank=True)
    inn = models.CharField(max_length=12, blank=True)
    bank_account = models.CharField(max_length=20, blank=True)
    bank_bik = models.CharField(max_length=9, blank=True)
    shop_description = models.TextField(blank=True)
    shop_logo = models.ImageField(upload_to='shops/', blank=True, null=True)
    tariff = models.CharField(max_length=20, choices=TARIFF_CHOICES, default=TARIFF_FREE)
    offer_accepted = models.BooleanField(default=False)
    offer_accepted_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_INCOMPLETE)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.user.email} ({self.get_status_display()})'


class Address(models.Model):
    """Адрес доставки покупателя (Ф10, узел 1.13).

    Несколько адресов на пользователя, ровно один is_default. queryset во вьюхе
    строго по владельцу (S: персданные - чужой адрес не виден). Будущий
    потребитель - чекаут (Ф9): выбор адреса вместо ручного delivery_address.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='addresses')
    full_name = models.CharField(max_length=200)
    phone = models.CharField(max_length=20)
    city = models.CharField(max_length=120)
    street = models.CharField(max_length=200)
    house = models.CharField(max_length=30)
    apartment = models.CharField(max_length=30, blank=True, default='')
    postal_code = models.CharField(max_length=20, blank=True, default='')
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Дефолтный адрес - первым, дальше новые сверху.
        ordering = ['-is_default', '-created_at']

    def __str__(self):
        return f'{self.city}, {self.street} {self.house} ({self.user.email})'


class OTPCode(models.Model):
    email = models.EmailField()
    code = models.CharField(max_length=6)
    # хранит хеш пароля (не плейнтекст) + username, role либо user_id/action
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)
    is_used = models.BooleanField(default=False)
    attempts = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ['-created_at']

    def is_valid(self):
        return not self.is_used and timezone.now() < self.created_at + timedelta(minutes=10)

    @classmethod
    def generate(cls, email, data):
        # Удаляем старые коды для этого email
        cls.objects.filter(email=email).delete()
        # secrets - криптостойкий ГПСЧ, в отличие от random (предсказуемый Mersenne Twister)
        code = str(secrets.randbelow(900000) + 100000)
        return cls.objects.create(email=email, code=code, data=data)

    def __str__(self):
        return f'{self.email} — {self.code}'