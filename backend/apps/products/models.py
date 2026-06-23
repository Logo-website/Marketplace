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
    # Модерация товара (Ф17, узел 3.2). rejection_reason - причина отклонения,
    # которую видит продавец в реестре Ф13/форме Ф12; чистится при одобрении и
    # при переотправке на модерацию (причина не залипает). moderated_at/by - след
    # привилегированного действия над контентом третьих лиц (опасная тройка,
    # аудит решений модерации); SET_NULL - удаление админа не теряет историю.
    rejection_reason = models.TextField(blank=True, default='')
    moderated_at = models.DateTimeField(null=True, blank=True)
    moderated_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
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
    # Ответ продавца на отзыв (Ф15, узел 2.8). 1:1 на Review, не отдельная модель:
    # официальный ответ ровно один - от продавца товара (проверяется в эндпоинте,
    # автора не храним - это review.product.seller). seller_reply_at=None отличает
    # «нет ответа» от «пустой ответ»; ставится при сохранении ответа.
    seller_reply = models.TextField(blank=True, default='')
    seller_reply_at = models.DateTimeField(null=True, blank=True)
    # Мягкое скрытие модератором (Ф18, узел 3.8). Не удаление: обратимо (unhide),
    # сохраняет аудит и держит границу unique_together (удалённый отзыв автор
    # переписал бы и вернул в рейтинг). Скрытый отзыв исключается из публичной
    # выдачи и из пересчёта рейтинга (signals.recalc_product_rating, §4.3).
    is_hidden = models.BooleanField(default=False, db_index=True)
    hidden_at = models.DateTimeField(null=True, blank=True)
    hidden_reason = models.TextField(blank=True, default='')
    hidden_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )

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
    # Мягкое скрытие модератором (Ф18, узел 3.8) - см. Review.is_hidden.
    # Скрытый вопрос пропадает из публичной ветки Q&A.
    is_hidden = models.BooleanField(default=False, db_index=True)
    hidden_at = models.DateTimeField(null=True, blank=True)
    hidden_reason = models.TextField(blank=True, default='')
    hidden_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )

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
    # Мягкое скрытие модератором (Ф18, узел 3.8) - см. Review.is_hidden.
    # Скрытый ответ исключается из публичной выдачи, его лайки не «всплывают».
    is_hidden = models.BooleanField(default=False, db_index=True)
    hidden_at = models.DateTimeField(null=True, blank=True)
    hidden_reason = models.TextField(blank=True, default='')
    hidden_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )

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


class Report(models.Model):
    """Жалоба на UGC/товар/продавца (Ф18, узел 3.8 + «пожаловаться» из 1.5).

    Полиморфная цель через target_type + target_id (не GenericForeignKey и не FK
    на каждую сущность): тип валидируется по allowlist реально существующих в коде
    моделей, target_id - на существование в сериализаторе (план §4.1). Жалоба
    сама ничего не скрывает - только ставит в очередь модератору; скрытие - решение
    админа (анти-цензура конкурентом, §9). reporter/resolved_by = SET_NULL -
    удаление пользователя не уносит историю/аудит."""
    TARGET_CHOICES = [
        ('product', 'Товар'), ('review', 'Отзыв'), ('seller', 'Продавец'),
        ('question', 'Вопрос'), ('answer', 'Ответ'),
    ]
    REASON_CHOICES = [
        ('spam', 'Спам'), ('abuse', 'Оскорбления'), ('fake', 'Фейк/накрутка'),
        ('fraud', 'Мошенничество'), ('forbidden', 'Запрещённый контент'),
        ('other', 'Другое'),
    ]
    STATUS_CHOICES = [
        ('open', 'Открыта'), ('resolved', 'Решена'), ('dismissed', 'Отклонена'),
    ]

    reporter = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, related_name='reports'
    )
    target_type = models.CharField(max_length=20, choices=TARGET_CHOICES)
    target_id = models.PositiveIntegerField()
    reason = models.CharField(max_length=20, choices=REASON_CHOICES)
    comment = models.TextField(blank=True, default='')
    status = models.CharField(
        max_length=12, choices=STATUS_CHOICES, default='open', db_index=True
    )
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    resolved_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='resolved_reports'
    )
    resolution_note = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.target_type}#{self.target_id} ({self.reason}, {self.status})'