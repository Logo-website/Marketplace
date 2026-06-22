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
    # «Старая цена» (Ф12, узел 2.3) - только хранение. Бейдж/расчёт скидки - Ф27.
    old_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    # stock - агрегат: при заданных attributes.sizes пересчитывается как сумма
    # остатков по размерам (Ф12 решение 4.2). Списание при заказе идёт по нему
    # (Ф8/Ф9), per-size списание - forward в Ф8/Ф9.
    stock = models.PositiveIntegerField(default=0)
    # Контракт attributes (единый источник правды для Ф4 и Ф12, план Ф12 4.1):
    #   brand:      str           - текст до Ф20 (сущности Brand нет)
    #   sizes:      [{label, stock, available}]  available=stock>0 (флаг показа Ф4)
    #   colors:     [{label, code}]
    #   specs:      {название: значение}  (состав/уход/страна/сезон/крой)
    #   size_chart: null          - привязка размерной сетки, заглушка до Ф5
    #   marking:    str           - «Честный знак», учебная заглушка без интеграции
    attributes = models.JSONField(default=dict, blank=True)
    # rejected заводит Ф13 (значение для вкладки/бейджа «отклонён» узла 2.2);
    # само действие «отклонить с причиной» ставит Ф17 - до неё вкладка пуста.
    status = models.CharField(max_length=20, choices=[
        ('active', 'Активен'),
        ('hidden', 'Скрыт'),
        ('moderation', 'На модерации'),
        ('rejected', 'Отклонён'),
        ('draft', 'Черновик'),
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


class Question(models.Model):
    """Публичный вопрос по товару (Ф6, узел 1.7). В отличие от Review,
    задать вопрос можно БЕЗ покупки - Q&A снимает возражения ДО неё."""
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='questions')
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='questions')
    text = models.TextField()
    # auto_now_add=True (НЕ как у Review с default=None): пустая дата ломала бы
    # ordering -created_at и new Date() на фронте.
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.username} ? {self.product.name}'


class Answer(models.Model):
    """Ответ на вопрос - от любого авторизованного (другой покупатель или
    продавец). helpful_count - денормализованный счётчик лайков (паттерн
    Product.rating P6a), индексируется для сортировки по полезности."""
    question = models.ForeignKey(Question, on_delete=models.CASCADE, related_name='answers')
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='answers')
    text = models.TextField()
    helpful_count = models.PositiveIntegerField(default=0, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        # Полезные сверху; при равенстве - старые раньше (стабильный тай-брейк).
        ordering = ['-helpful_count', 'created_at']

    def __str__(self):
        return f'{self.user.username} → Q{self.question_id}'


class AnswerVote(models.Model):
    """Лайк «полезно» на ответ. unique_together исключает накрутку повтором;
    helpful_count пересчитывается из этих строк сигналом."""
    answer = models.ForeignKey(Answer, on_delete=models.CASCADE, related_name='votes')
    user = models.ForeignKey('users.User', on_delete=models.CASCADE, related_name='answer_votes')

    class Meta:
        unique_together = ['answer', 'user']