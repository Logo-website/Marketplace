from django.contrib.auth.models import AbstractUser
from django.db import models
import secrets
from django.utils import timezone
from datetime import timedelta

# После скольких неверных попыток ввода код инвалидируется (анти-брутфорс)
MAX_OTP_ATTEMPTS = 5

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

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['username']

    def save(self, *args, **kwargs):
        # Синхронизируем role=admin с Django is_staff/is_superuser
        if self.role == self.ROLE_ADMIN:
            self.is_staff = True
            self.is_superuser = True
        super().save(*args, **kwargs)

    def __str__(self):
        return self.email

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