from django.db import models
from apps.users.models import User


class Category(models.Model):
    name = models.CharField(max_length=255)
    slug = models.SlugField(unique=True)
    parent = models.ForeignKey('self', on_delete=models.CASCADE, null=True, blank=True, related_name='children')
    # Видимость в каталоге (Ф19, узел 3.5 «скрыть»). Не is_active (как у User -
    # «может аутентифицироваться») и не status (как у Product): здесь смысл узкий -
    # «показывается ли в навигации каталога Ф2». Скрытие обратимо и НЕ удаляет
    # товары (Product.category on_delete=SET_NULL не трогаем) - в отличие от
    # удаления, где parent on_delete=CASCADE снёс бы ветку.
    is_visible = models.BooleanField(default=True)

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


class SellerReview(models.Model):
    """Отзыв о продавце (Ф20, узел 1.21) - отдельная сущность от товарного Review.
    Оценивает не товар, а работу продавца (скорость, упаковка, соответствие
    описанию). Право оставить - только купивший у продавца (проверка в эндпоинте,
    по образцу товарного отзыва «если купил»), не сам себе. unique_together -
    один отзыв на продавца от пользователя (повтор -> 400).

    Рейтинг продавца денормализуется в User.seller_rating сигналом (как
    Product.rating из Review). Ответ продавца на отзыв - это Ф15, здесь не поле."""
    seller = models.ForeignKey(User, on_delete=models.CASCADE, related_name='seller_reviews_received')
    author = models.ForeignKey(User, on_delete=models.CASCADE, related_name='seller_reviews_written')
    rating = models.IntegerField()
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = ['seller', 'author']

    def __str__(self):
        return f'{self.author.username} → {self.seller.username} ({self.rating}★)'


class BrandFollow(models.Model):
    """Подписка покупателя на бренд/продавца (Ф20, узел 1.21). Серверная (не
    localStorage, как избранное 1.10): подписка - источник событий для рассылки
    новинок/акций (Ф25). В Ф20 только хранение, уведомление не шлётся.
    unique_together - идемпотентность (повторная подписка не плодит дубль).
    На свой же магазин подписаться нельзя (проверка в эндпоинте)."""
    follower = models.ForeignKey(User, on_delete=models.CASCADE, related_name='following')
    seller = models.ForeignKey(User, on_delete=models.CASCADE, related_name='followers')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ['follower', 'seller']

    def __str__(self):
        return f'{self.follower.username} → {self.seller.username}'


class Look(models.Model):
    """Образ / лукбук - готовый комплект из нескольких товаров (Ф22, узел 1.23).
    Главное отличие ниши от Lamoda: продаём не отдельные вещи, а собранные образы.

    Источник (source) - редакция площадки или конкретный бренд (план §3):
    - editorial: всегда seller=null (автор-админ заводит через админку/сиды);
    - brand: привязан к seller (User role=seller), показывается на витрине Ф20.
    Консистентность источника проверяет clean() (админ-форма зовёт full_clean).

    is_published - флаг публикации (ставит админ/сид, §3): черновик не светится в
    ленте и отдаёт 404. Сумму комплекта НЕ денормализуем - считаем в сериализаторе
    по активным вещам (меняется с ценой/статусом товара, §4.1). seller=CASCADE -
    как Product.seller: удаление бренда уносит его образы."""
    SOURCE_CHOICES = [('editorial', 'Редакция'), ('brand', 'Бренд')]

    title = models.CharField(max_length=200)
    description = models.TextField(blank=True, default='')
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='editorial')
    seller = models.ForeignKey(
        User, on_delete=models.CASCADE, null=True, blank=True, related_name='looks'
    )
    # Обложка образа - фото комплекта целиком (не одной вещи, прямо по узлу 1.23).
    # Пара image/url как у ProductImage: загрузка файла или внешняя ссылка (сиды).
    cover_image = models.ImageField(upload_to='looks/', blank=True, null=True)
    cover_url = models.URLField(blank=True, null=True)
    is_published = models.BooleanField(default=False, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    def clean(self):
        from django.core.exceptions import ValidationError
        # brand требует продавца, editorial - без него (план §5, консистентность).
        if self.source == 'brand' and self.seller_id is None:
            raise ValidationError({'seller': 'Образ бренда требует продавца'})
        if self.source == 'editorial' and self.seller_id is not None:
            raise ValidationError({'seller': 'Редакционный образ без продавца'})

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.title


class LookItem(models.Model):
    """Вещь в образе (Ф22). M2M Look<->Product с порядком показа. product=CASCADE:
    удалённый товар выпадает из образа, карточка не ломается (план §5).
    unique_together(look, product) - один товар не дублируется в одном образе
    (между разными образами - норма)."""
    look = models.ForeignKey(Look, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.CASCADE, related_name='look_items')
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ['order']
        unique_together = ['look', 'product']

    def __str__(self):
        return f'{self.look.title}: {self.product.name}'


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