from django.db import models
from apps.users.models import User


class Category(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')

    def __str__(self):
        return self.name

    class Meta:
        verbose_name_plural = 'Categories'


class Product(models.Model):
    seller = models.ForeignKey(User, on_delete=models.CASCADE, related_name='products')
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, related_name='products')
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    description = models.TextField(blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    stock = models.PositiveIntegerField(default=0)
    attributes = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=[
        ('active', 'Активен'),
        ('hidden', 'Скрыт'),
        ('moderation', 'На модерации'),
    ], default='moderation', db_index=True)
    # Денормализация рейтинга (P6a): пересчитывается из Review сигналами,
    # индексируется для сортировки по рейтингу без .extra()+CAST по JSON.
    rating = models.FloatField(default=0, db_index=True)
    reviews_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['-created_at']


class ProductImage(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='images')
    image = models.ImageField(upload_to='products/', blank=True, null=True)
    image_url = models.URLField(blank=True, null=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']

class Review(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='reviews')
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='reviews')
    rating = models.IntegerField()
    text = models.TextField()
    # auto_now_add: дата проставляется при создании (в т.ч. через API,
    # serializer.save() её не передаёт). Ранее было default=None - отзыв из
    # API получал created_at=None, что ломало ordering и new Date() на фронте.
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['product', 'user']

    def __str__(self):
        return f'{self.user.username} → {self.product.name} ({self.rating}★)'