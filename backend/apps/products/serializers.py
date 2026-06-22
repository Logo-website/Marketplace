from django.utils.text import slugify
from rest_framework import serializers
from .models import Answer, Category, Product, ProductImage, Question, Review

class CategorySerializer(serializers.ModelSerializer):
    # Дерево категорий одним ответом: каждый узел несёт вложенных детей
    # (Ф1, каталог-меню). Рекурсия по related_name='children'. Глубина
    # произвольная; на реальных 2-3 уровнях N+1 гасится prefetch во вьюхе
    # и часовым кэшем categories:root.
    children = serializers.SerializerMethodField()

    class Meta:
        model = Category
        fields = ['id', 'name', 'slug', 'parent', 'children']

    def get_children(self, obj):
        return CategorySerializer(obj.children.all(), many=True).data


class ProductImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProductImage
        fields = ['id', 'image', 'image_url', 'order']


class ProductSerializer(serializers.ModelSerializer):
    images = ProductImageSerializer(many=True, read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    # S17: публичное имя магазина, НЕ email продавца. Каталог отдаётся
    # анонимам (AllowAny) - email тут был утечкой персданных третьих лиц.
    seller_name = serializers.SerializerMethodField()
    # Ф5: размерная группа товара (верх/низ/платья/обувь) или null. Карточка
    # решает, показывать ли ссылку «Размерная сетка», без отдельного запроса
    # (резолв через тот же маппинг из size_charts.py - единый источник правды).
    size_group = serializers.SerializerMethodField()

    def get_seller_name(self, obj):
        seller = obj.seller
        if seller is None:
            return ''
        return seller.shop_name or seller.username

    def get_size_group(self, obj):
        from .size_charts import size_group_for_category
        return size_group_for_category(obj.category)

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'slug', 'description', 'price', 'old_price',
            'stock', 'attributes', 'status', 'category',
            'category_name', 'seller_name', 'size_group', 'images', 'created_at',
            'rating', 'reviews_count', 'rejection_reason'
        ]
        # rejection_reason - read-only (пишет только модерация Ф17 через сервис).
        # Непустой только у rejected-товаров, которых нет в публичном каталоге -
        # утечки нет, а продавец видит причину в Ф13/форме через тот же сериализатор.
        read_only_fields = ['seller', 'created_at', 'rating', 'reviews_count',
                            'rejection_reason']


# Лимиты структуры attributes (граничные случаи плана Ф12, часть 6): очень
# длинные строки обрезаем/режем, мусорные структуры -> 400, не запись битого JSON.
SIZE_LABEL_MAX = 20
SPEC_KEY_MAX = 60
SPEC_VALUE_MAX = 500
COLOR_CODE_MAX = 20
BRAND_MAX = 255
MARKING_MAX = 255

# Целевые статусы формы продавца. active в обход модерации недоступен
# (S: статус-инъекция, план 9) - его ставит только Ф17/админ.
WRITE_STATUSES = ('draft', 'moderation')


def _unique_slug(name):
    """Slug на сервере из name (план 4.6): убирает ручной ввод slug и коллизии
    unique=True. Кириллица -> slugify даёт '' -> fallback 'product'; при занятом
    slug добавляем числовой суффикс."""
    base = slugify(name) or 'product'
    slug = base
    i = 2
    while Product.objects.filter(slug=slug).exists():
        slug = f'{base}-{i}'
        i += 1
    return slug


def _validate_product_attributes(value):
    """Валидирует и нормализует contract attributes (план 4.1). Мусорную
    структуру отклоняет (400), а не пишет битый JSON. Неизвестные ключи
    отбрасывает - единый источник правды для Ф4."""
    if value in (None, ''):
        return {}
    if not isinstance(value, dict):
        raise serializers.ValidationError('Должен быть объектом')

    cleaned = {}

    brand = value.get('brand')
    if brand:
        cleaned['brand'] = str(brand).strip()[:BRAND_MAX]

    sizes = value.get('sizes')
    if sizes:
        if not isinstance(sizes, list):
            raise serializers.ValidationError({'sizes': 'Размеры должны быть списком'})
        out, seen = [], set()
        for item in sizes:
            if not isinstance(item, dict) or not str(item.get('label', '')).strip():
                raise serializers.ValidationError({'sizes': 'Каждый размер - объект с label'})
            label = str(item['label']).strip()[:SIZE_LABEL_MAX]
            if label.lower() in seen:
                raise serializers.ValidationError({'sizes': f'Дубликат размера: {label}'})
            seen.add(label.lower())
            try:
                stock = int(item.get('stock', 0))
            except (TypeError, ValueError):
                raise serializers.ValidationError({'sizes': 'Остаток размера - целое число'})
            if stock < 0:
                raise serializers.ValidationError({'sizes': 'Остаток размера не может быть отрицательным'})
            # available - флаг ПОКАЗА для Ф4 (VariantPicker читает available, не stock);
            # stock хранится для агрегата и forward Ф8/Ф9.
            out.append({'label': label, 'stock': stock, 'available': stock > 0})
        cleaned['sizes'] = out

    colors = value.get('colors')
    if colors:
        if not isinstance(colors, list):
            raise serializers.ValidationError({'colors': 'Цвета должны быть списком'})
        out = []
        for item in colors:
            if not isinstance(item, dict) or not str(item.get('label', '')).strip():
                raise serializers.ValidationError({'colors': 'Каждый цвет - объект с label'})
            color = {'label': str(item['label']).strip()[:SIZE_LABEL_MAX]}
            code = item.get('code')
            if code:
                color['code'] = str(code).strip()[:COLOR_CODE_MAX]
            out.append(color)
        cleaned['colors'] = out

    specs = value.get('specs')
    if specs:
        if not isinstance(specs, dict):
            raise serializers.ValidationError({'specs': 'Характеристики - объект ключ-значение'})
        out = {}
        for k, v in specs.items():
            key = str(k).strip()[:SPEC_KEY_MAX]
            val = str(v).strip()[:SPEC_VALUE_MAX] if v is not None else ''
            if key and val:
                out[key] = val
        if out:
            cleaned['specs'] = out

    # size_chart - заглушка Ф5 (привязки сетки пока нет): всегда null.
    cleaned['size_chart'] = None

    marking = value.get('marking')
    if marking:
        cleaned['marking'] = str(marking).strip()[:MARKING_MAX]

    return cleaned


class ProductWriteSerializer(serializers.ModelSerializer):
    """Форма карточки товара (Ф12, узел 2.3): создание и редактирование одним
    сериализатором. Статус ограничен draft|moderation - самоодобрение в active
    невозможно (план 9). slug генерится на сервере, stock - агрегат по размерам."""
    # default='draft': форма всегда шлёт статус кнопкой, но дефолт безопасен
    # (не active). На update partial поле необязательно - статус не сбрасывается.
    status = serializers.ChoiceField(choices=WRITE_STATUSES, default='draft')

    class Meta:
        model = Product
        fields = ['name', 'description', 'price', 'old_price', 'stock',
                  'attributes', 'category', 'status']

    def validate_price(self, value):
        if value is None or value <= 0:
            raise serializers.ValidationError('Цена должна быть больше 0')
        return value

    def validate_attributes(self, value):
        return _validate_product_attributes(value)

    def validate(self, data):
        # old_price (если задана) строго больше price, иначе «скидка» неположительна
        # (граничный случай плана). На update price берём из инстанса, если не пришла.
        price = data.get('price', getattr(self.instance, 'price', None))
        old_price = data.get('old_price')
        if old_price is not None and price is not None and old_price <= price:
            raise serializers.ValidationError(
                {'old_price': 'Старая цена должна быть больше текущей'}
            )
        return data

    def _apply_stock_aggregate(self, validated_data):
        # stock = сумма остатков по размерам, если размеры заданы (план 4.2);
        # иначе остаётся значение из поля «остаток».
        attrs = validated_data.get('attributes')
        if attrs and attrs.get('sizes'):
            validated_data['stock'] = sum(s['stock'] for s in attrs['sizes'])

    def create(self, validated_data):
        validated_data['seller'] = self.context['request'].user
        validated_data['slug'] = _unique_slug(validated_data['name'])
        self._apply_stock_aggregate(validated_data)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        # slug при правке name НЕ перегенерируем - стабильность внешних ссылок (4.5).
        validated_data.pop('slug', None)
        self._apply_stock_aggregate(validated_data)
        # Переотправка отклонённого товара (Ф17, §6): продавец правит rejected и
        # снова шлёт на модерацию - причина прошлого отклонения не должна залипать.
        if validated_data.get('status') == 'moderation':
            validated_data['rejection_reason'] = ''
        return super().update(instance, validated_data)

# Лимит длины причины отклонения (Ф17, §6): причина обязательна по узлу 3.2
# («отклонить с причиной»), показывается продавцу как ТЕКСТ (XSS, §9), очень
# длинную/пустую отклоняем 400, а не пишем мусор.
REJECTION_REASON_MAX = 1000


class RejectionSerializer(serializers.Serializer):
    """Причина отклонения товара (Ф17). Только текст - статус/аудит ставит сервис."""
    reason = serializers.CharField()

    def validate_reason(self, value):
        v = (value or '').strip()
        if not v:
            raise serializers.ValidationError('Укажите причину отклонения')
        if len(v) > REJECTION_REASON_MAX:
            raise serializers.ValidationError(
                f'Слишком длинная причина (макс. {REJECTION_REASON_MAX} символов)'
            )
        return v


# Лимит длины ответа продавца (граничный случай плана Ф15, часть 6): чтобы
# официальный ответ не стал каналом для «портянки». Пустое/пробельное -> 400.
SELLER_REPLY_MAX = 2000


class ReviewSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Review
        # seller_reply/at read-only: видны публично через GET /<pk>/reviews/,
        # пишутся только через ReviewReplyView (Ф15). Пустой seller_reply -
        # «ответа нет», блок на карточке не рисуется.
        fields = ['id', 'username', 'rating', 'text', 'created_at',
                  'seller_reply', 'seller_reply_at']
        read_only_fields = ['id', 'username', 'created_at',
                            'seller_reply', 'seller_reply_at']


class ReviewReplySerializer(serializers.Serializer):
    """Запись ответа продавца на отзыв (Ф15, узел 2.8). Только текст - автора и
    дату ставит вьюха (автор = product.seller, проверка владения там же)."""
    text = serializers.CharField()

    def validate_text(self, value):
        v = (value or '').strip()
        if not v:
            raise serializers.ValidationError('Введите текст ответа')
        if len(v) > SELLER_REPLY_MAX:
            raise serializers.ValidationError(
                f'Слишком длинный ответ (макс. {SELLER_REPLY_MAX} символов)'
            )
        return v


class SellerReviewSerializer(serializers.ModelSerializer):
    """Отзыв в кабинете продавца (Ф15): отзыв + product-контекст для перехода и
    ответ продавца. PII покупателя - только username (как публично), без email/id
    (часть 9, минимизация). product - CASCADE, значит при отзыве он всегда есть."""
    username = serializers.CharField(source='user.username', read_only=True)
    product_id = serializers.IntegerField(source='product.id', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = Review
        fields = ['id', 'username', 'rating', 'text', 'created_at',
                  'seller_reply', 'seller_reply_at',
                  'product_id', 'product_name']


class MyReviewSerializer(serializers.ModelSerializer):
    """Отзыв в кабинете покупателя (Ф10): минимум данных товара для ссылки на
    карточку. product - on_delete=CASCADE, значит при отзыве он всегда есть."""
    product_id = serializers.IntegerField(source='product.id', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_image = serializers.SerializerMethodField()

    class Meta:
        model = Review
        fields = ['id', 'rating', 'text', 'created_at',
                  'product_id', 'product_name', 'product_image']

    def get_product_image(self, obj):
        img = obj.product.images.first()
        if not img:
            return None
        return img.image_url or (img.image.url if img.image else None)


class ReviewCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Review
        fields = ['rating', 'text']

    def validate_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError('Оценка должна быть от 1 до 5')
        return value


# Предел длины UGC Q&A (граничный случай плана, часть 6): пустое/пробельное -
# отклоняем, очень длинное - тоже.
QA_TEXT_MAX = 1000


def _validate_qa_text(value):
    v = (value or '').strip()
    if not v:
        raise serializers.ValidationError('Введите текст')
    if len(v) > QA_TEXT_MAX:
        raise serializers.ValidationError(f'Слишком длинный текст (макс. {QA_TEXT_MAX} символов)')
    return v


class AnswerSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    # Бейдж «Продавец»: author == product.seller. Вычисляется на сервере
    # (seller_id из контекста вьюхи), клиенту не доверяем.
    is_seller_answer = serializers.SerializerMethodField()
    # Лайкнул ли текущий юзер. Голоса префетчатся фильтром по юзеру во вьюхе -
    # без N+1; для гостя всегда False (до обращения к obj.votes).
    liked_by_me = serializers.SerializerMethodField()

    class Meta:
        model = Answer
        fields = ['id', 'username', 'text', 'helpful_count', 'is_seller_answer', 'liked_by_me', 'created_at']

    def get_is_seller_answer(self, obj):
        return obj.user_id == self.context.get('seller_id')

    def get_liked_by_me(self, obj):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return False
        # votes уже префетчены фильтром по текущему юзеру (см. get_queryset).
        return len(obj.votes.all()) > 0


class QuestionSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    answers = AnswerSerializer(many=True, read_only=True)

    class Meta:
        model = Question
        fields = ['id', 'username', 'text', 'created_at', 'answers']


class SellerQuestionSerializer(QuestionSerializer):
    """Вопрос в кабинете продавца (Ф15): тот же вопрос с вложенными ответами
    (бейдж «Продавец» через AnswerSerializer.is_seller_answer), плюс product-
    контекст для перехода. Ответ продавец шлёт в существующий answer-эндпоинт Ф6."""
    product_id = serializers.IntegerField(source='product.id', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta(QuestionSerializer.Meta):
        fields = QuestionSerializer.Meta.fields + ['product_id', 'product_name']


class QuestionCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Question
        fields = ['text']

    def validate_text(self, value):
        return _validate_qa_text(value)


class AnswerCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Answer
        fields = ['text']

    def validate_text(self, value):
        return _validate_qa_text(value)