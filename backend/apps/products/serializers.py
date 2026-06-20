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
            'id', 'name', 'slug', 'description', 'price',
            'stock', 'attributes', 'status', 'category',
            'category_name', 'seller_name', 'size_group', 'images', 'created_at',
            'rating', 'reviews_count'
        ]
        read_only_fields = ['seller', 'created_at', 'rating', 'reviews_count']


class ProductCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Product
        fields = ['name', 'slug', 'description', 'price', 'stock', 'attributes', 'category', 'status']
        # status - read-only на seller-write пути: иначе PATCH /products/my/{id}/
        # с {"status":"active"} даёт продавцу самоодобрение товара из moderation
        # (обход модерации). active/hidden меняет только выделенный путь (Ф13
        # visibility-эндпоинт) / Ф17 / админ. Создание ставит статус через
        # setdefault ниже, не из ввода.
        read_only_fields = ['status']

    def create(self, validated_data):
        validated_data['seller'] = self.context['request'].user
        validated_data.setdefault('status', 'active')
        return super().create(validated_data)

class ReviewSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)

    class Meta:
        model = Review
        fields = ['id', 'username', 'rating', 'text', 'created_at']
        read_only_fields = ['id', 'username', 'created_at']


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