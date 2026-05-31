from django.contrib.auth.models import AbstractUser
from django.db import models
import random
from django.utils import timezone
from datetime import timedelta

class User(AbstractUser):
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=20, blank=True)
    avatar = models.ImageField(upload_to='avatars/', blank=True, null=True)

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

class OTPCode(models.Model):
    email = models.EmailField()
    code = models.CharField(max_length=6)
    data = models.JSONField(default=dict)  # хранит email, username, password, role
    created_at = models.DateTimeField(auto_now_add=True)
    is_used = models.BooleanField(default=False)

    class Meta:
        ordering = ['-created_at']

    def is_valid(self):
        return not self.is_used and timezone.now() < self.created_at + timedelta(minutes=10)

    @classmethod
    def generate(cls, email, data):
        # Удаляем старые коды для этого email
        cls.objects.filter(email=email).delete()
        code = str(random.randint(100000, 999999))
        return cls.objects.create(email=email, code=code, data=data)

    def __str__(self):
        return f'{self.email} — {self.code}'