from django.contrib.auth.models import AbstractUser
from django.db import models


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

    def __str__(self):
        return self.email