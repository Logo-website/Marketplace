import requests
from django.conf import settings
from django.db.models import Count, Prefetch
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Answer, AnswerVote, Category, Product, Question, Review
from .serializers import (
    CategorySerializer, ProductSerializer, ProductCreateSerializer,
    ReviewSerializer, ReviewCreateSerializer,
    QuestionSerializer, QuestionCreateSerializer, AnswerCreateSerializer,
)
from .search import search_products, autocomplete, index_product, delete_product, PRICE_RANGES
from .size_charts import get_size_chart
from .caching import cache_get, cache_set
from services.clickhouse_service import ClickHouseService
from apps.permissions import IsSeller
import logging

logger = logging.getLogger(__name__)

CATEGORIES_CACHE_KEY = 'categories:root'
CATEGORIES_CACHE_TTL = 60 * 60  # категории меняются редко
PRODUCT_CACHE_KEY = 'product_detail:{}'
PRODUCT_CACHE_TTL = 60 * 5
SIZE_CHART_CACHE_KEY = 'size_chart:{}'
SIZE_CHART_CACHE_TTL = 60 * 60  # размерный справочник меняется редко (как категории)


class CategoryListView(generics.ListAPIView):
    # prefetch на 2 уровня вглубь (root -> дети -> внуки) покрывает реальную
    # глубину каталога одежды без N+1; ответ кэшируется на час (categories:root).
    queryset = Category.objects.filter(parent=None).prefetch_related('children__children')
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]

    def list(self, request, *args, **kwargs):
        data = cache_get(CATEGORIES_CACHE_KEY)
        if data is None:
            data = self.get_serializer(self.get_queryset(), many=True).data
            cache_set(CATEGORIES_CACHE_KEY, data, CATEGORIES_CACHE_TTL)
        return Response(data)


class ProductListView(generics.ListAPIView):
    serializer_class = ProductSerializer
    permission_classes = [permissions.AllowAny]
    filter_backends = [filters.OrderingFilter, filters.SearchFilter]
    ordering_fields = ['price', 'created_at']
    search_fields = ['name', 'description']

    def get_queryset(self):
        queryset = Product.objects.filter(status='active').select_related('category', 'seller').prefetch_related(
            'images')

        category_id = self.request.query_params.get('category')
        if category_id:
            queryset = queryset.filter(category_id=category_id)

        # Фильтры каталога Ф2 (цена/бренд/рейтинг/наличие). Ставим в get_queryset
        # как category/sort, не ломая ?ordering=/?search= от DRF-бэкендов.
        queryset = _apply_catalog_filters(queryset, self.request.query_params)

        sort = self.request.query_params.get('sort', 'popular')
        if sort == 'price_asc':
            queryset = queryset.order_by('price')
        elif sort == 'price_desc':
            queryset = queryset.order_by('-price')
        elif sort == 'rating':
            queryset = queryset.order_by('-rating', '-reviews_count')
        elif sort == 'new':
            queryset = queryset.order_by('-created_at')
        else:
            queryset = queryset.order_by('-id')

        return queryset


class ProductDetailView(generics.RetrieveAPIView):
    queryset = Product.objects.filter(status='active').select_related(
        'category', 'seller').prefetch_related('images')
    serializer_class = ProductSerializer
    permission_classes = [permissions.AllowAny]

    def retrieve(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        cache_key = PRODUCT_CACHE_KEY.format(pk)
        data = cache_get(cache_key)
        if data is None:
            instance = self.get_object()  # 404, если товара нет или он не active
            data = self.get_serializer(instance).data
            cache_set(cache_key, data, PRODUCT_CACHE_TTL)
        # Просмотр логируем всегда, в т.ч. на cache-hit: вызов снаружи кэша,
        # аналитика не теряется (разрешение конфликта P5/P6).
        if request.user.is_authenticated:
            ClickHouseService.log_view(request.user.id, int(pk))
        return Response(data)


class SizeChartView(APIView):
    """Размерная сетка товара (Ф5, узел 1.6). Публичный справочник.

    Резолвит товар -> категория -> группа размеров -> таблица из size_charts.py.
    - Товар с сеткой -> {group, measurements, conversion}.
    - Товар без сетки (аксессуары/носки/нет категории) -> {group: null} (200,
      НЕ 404): фронт отличает «нет сетки» от ошибки сети (урок Ф0).
    - Несуществующий/неактивный товар -> 404.

    AllowAny: справочник публичен, как весь каталог. Кэш - как у категорий
    (меняется редко). Мерки тела сюда не приходят - подбор размера считается
    на клиенте (персданные наружу не уходят, план Ф5 решение 5).
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        cache_key = SIZE_CHART_CACHE_KEY.format(pk)
        data = cache_get(cache_key)
        if data is None:
            # status='active' - паритет с ProductDetailView: сетку скрытого/
            # снятого товара не отдаём (как и саму карточку).
            product = get_object_or_404(Product, pk=pk, status='active')
            chart = get_size_chart(product.category)
            data = chart if chart is not None else {'group': None}
            cache_set(cache_key, data, SIZE_CHART_CACHE_TTL)
        return Response(data)


def _parse_decimal(value):
    """Безопасный разбор цены из query-параметра: некорректное значение -> None."""
    if value in (None, ''):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


# Фасет брендов может содержать сотни значений (бренд = brand_name OR
# seller_name в сиде) - отдаём топ-N по счётчику, остальное скрываем за
# «показать ещё»/поиском внутри группы на клиенте.
BRAND_FACET_LIMIT = 30
# Пороги рейтинга для фильтра «от N звёзд». На сид-данных rating=0 у всех -
# фасет вырожден (см. план Ф2, часть 2), но механизм честный.
RATING_THRESHOLDS = [4, 3, 2, 1]

# Имена фасетов - чтобы при подсчёте счётчиков исключать собственный фильтр
# фасета (per-facet filtered aggregation, как post_filter в ES-поиске Ф3).
FACET_PRICE = 'price'
FACET_BRAND = 'brand'
FACET_RATING = 'rating'
FACET_IN_STOCK = 'in_stock'


def _apply_catalog_filters(queryset, params, exclude=None):
    """Применяет фильтры каталога (цена/бренд/рейтинг/наличие) к queryset.

    exclude - множество имён фасетов, чей собственный фильтр НЕ применять.
    Нужно для подсчёта фасетов: каждый фасет считается без своего фильтра,
    но с учётом остальных (per-facet filtered aggregation, как в поиске Ф3),
    чтобы мульти-выбор внутри группы работал и счётчики совпадали с Ф3.

    Кривые значения (нечисло, мусор) безопасно игнорируются, выдача не падает.
    """
    exclude = exclude or set()

    if FACET_PRICE not in exclude:
        min_price = _parse_decimal(params.get('min_price'))
        max_price = _parse_decimal(params.get('max_price'))
        if min_price is not None:
            queryset = queryset.filter(price__gte=min_price)
        if max_price is not None:
            queryset = queryset.filter(price__lte=max_price)

    if FACET_BRAND not in exclude:
        brands = [b for b in params.getlist('brand') if b]
        if brands:
            queryset = queryset.filter(attributes__brand__in=brands)

    if FACET_RATING not in exclude:
        min_rating = _parse_decimal(params.get('min_rating'))
        if min_rating is not None:
            queryset = queryset.filter(rating__gte=min_rating)

    if FACET_IN_STOCK not in exclude:
        if params.get('in_stock') in ('1', 'true', 'True'):
            queryset = queryset.filter(stock__gt=0)

    return queryset


class CatalogFacetsView(APIView):
    """Доступные значения фильтров каталога со счётчиками (Ф2, узел 1.3).

    Считает фасеты по Postgres ORM (бренд/рейтинг/наличие лежат в БД, а не в
    ES-индексе - см. план Ф2, решение 3). Каждый фасет агрегируется БЕЗ своего
    собственного фильтра, но с учётом остальных активных фильтров и категории
    (per-facet filtered aggregation, как post_filter в поиске Ф3). Ценовые
    корзины - из той же константы PRICE_RANGES, что и поиск, чтобы каталог и
    поиск коридорили цену одинаково.

    Публичный (AllowAny): каталог доступен всем ролям. Пустой результат - не 500.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        params = request.query_params
        base = Product.objects.filter(status='active')
        category_id = params.get('category')
        if category_id:
            base = base.filter(category_id=category_id)

        # Общий count - под всеми применёнными фильтрами.
        count = _apply_catalog_filters(base, params).count()

        # Бренды: без фильтра бренда (чтобы мульти-выбор работал). Пустой/None
        # бренд исключаем - не плодим мёртвую корзину «без бренда».
        brand_qs = _apply_catalog_filters(base, params, exclude={FACET_BRAND})
        brand_rows = (
            brand_qs.values('attributes__brand')
            .annotate(count=Count('id'))
            .order_by('-count')
        )
        brands = [
            {'value': r['attributes__brand'], 'count': r['count']}
            for r in brand_rows if r['attributes__brand']
        ][:BRAND_FACET_LIMIT]

        # Цена: без фильтра цены. Границы корзин - семантика ES range
        # (from включительно, to исключительно), чтобы совпасть с Ф3.
        price_qs = _apply_catalog_filters(base, params, exclude={FACET_PRICE})
        price_ranges = []
        for r in PRICE_RANGES:
            bucket = price_qs
            if 'from' in r:
                bucket = bucket.filter(price__gte=r['from'])
            if 'to' in r:
                bucket = bucket.filter(price__lt=r['to'])
            price_ranges.append({
                'key': r['key'],
                'from': r.get('from'),
                'to': r.get('to'),
                'count': bucket.count(),
            })

        # Рейтинг: без фильтра рейтинга. На сид-данных rating=0 у всех -
        # все пороги дадут 0, группа на клиенте не отрисуется (data-driven).
        rating_qs = _apply_catalog_filters(base, params, exclude={FACET_RATING})
        rating_thresholds = [
            {'value': t, 'count': rating_qs.filter(rating__gte=t).count()}
            for t in RATING_THRESHOLDS
        ]

        # Наличие: без фильтра наличия.
        stock_qs = _apply_catalog_filters(base, params, exclude={FACET_IN_STOCK})
        in_stock_count = stock_qs.filter(stock__gt=0).count()

        return Response({
            'count': count,
            'brands': brands,
            'price_ranges': price_ranges,
            'rating_thresholds': rating_thresholds,
            'in_stock_count': in_stock_count,
        })


def _products_in_order(product_ids):
    """Товары по id с сохранением порядка релевантности из ES."""
    from django.db.models import Case, When, IntegerField
    preserved_order = Case(
        *[When(id=pk, then=pos) for pos, pk in enumerate(product_ids)],
        output_field=IntegerField()
    )
    return Product.objects.filter(id__in=product_ids).select_related(
        'category', 'seller').prefetch_related('images').order_by(preserved_order)


def _active_in_order(ids, exclude_id=None):
    """
    Активные товары по списку id с сохранением порядка из матрицы рекомендаций.
    status='active' обязателен: нельзя рекомендовать скрытый/снятый товар
    (а C++/матрица о статусе не знают - храним только id).
    """
    from django.db.models import Case, When, IntegerField
    ids = [i for i in ids if i != exclude_id]
    if not ids:
        return []
    order = Case(
        *[When(id=pk, then=pos) for pos, pk in enumerate(ids)],
        output_field=IntegerField()
    )
    return list(
        Product.objects.filter(id__in=ids, status='active')
        .select_related('category', 'seller').prefetch_related('images')
        .order_by(order)
    )


class ProductSearchView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        params = request.query_params
        query = params.get('q', '').strip()
        if not query:
            return Response({'error': 'Введите поисковый запрос'}, status=400)

        # Те же фильтры, что в каталоге Ф2 (цена/бренд/рейтинг/наличие/категория).
        result = search_products(
            query,
            min_price=_parse_decimal(params.get('min_price')),
            max_price=_parse_decimal(params.get('max_price')),
            category=params.get('category'),
            brands=[b for b in params.getlist('brand') if b],
            min_rating=_parse_decimal(params.get('min_rating')),
            in_stock=params.get('in_stock') in ('1', 'true', 'True'),
            sort=params.get('sort'),
            page=params.get('page', 1),
            page_size=params.get('page_size', 20),
        )

        # ES недоступен - явная ошибка, а не ложное «ничего не найдено» (решение 6).
        if result.get('error'):
            return Response({'error': 'Поиск временно недоступен'}, status=503)

        product_ids = result['ids']
        if product_ids:
            products = _products_in_order(product_ids)
            results_data = ProductSerializer(products, many=True).data
        else:
            results_data = []

        # Обогащаем фасеты категорий именами одним запросом (ES хранит только id).
        facets = result['facets']
        cat_ids = [c['id'] for c in facets['categories']]
        names = dict(Category.objects.filter(id__in=cat_ids).values_list('id', 'name'))
        for c in facets['categories']:
            c['name'] = names.get(c['id'], '')

        return Response({
            'count': result['total'],
            'results': results_data,
            'facets': facets,
            'suggestion': result.get('suggestion'),
        })


class AutocompleteView(APIView):
    """Лёгкие подсказки для строки поиска. Минимальные поля, без фасетов."""
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        query = request.query_params.get('q', '').strip()
        if len(query) < 2:
            return Response([])

        ids = autocomplete(query)
        if not ids:
            return Response([])

        products = _products_in_order(ids)
        data = []
        for p in products:
            images = list(p.images.all())
            data.append({
                'id': p.id,
                'name': p.name,
                'price': str(p.price),
                'category_name': p.category.name if p.category else '',
                'image_url': images[0].image_url if images else None,
            })
        return Response(data)


class ProductCreateView(generics.CreateAPIView):
    serializer_class = ProductCreateSerializer
    permission_classes = [IsSeller]

    def perform_create(self, serializer):
        product = serializer.save()
        index_product(product)


class SellerProductListView(generics.ListAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsSeller]

    def get_queryset(self):
        return Product.objects.filter(seller=self.request.user)


class SellerProductUpdateView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ProductCreateSerializer
    permission_classes = [IsSeller]

    def get_queryset(self):
        return Product.objects.filter(seller=self.request.user)

    def perform_update(self, serializer):
        product = serializer.save()
        index_product(product)

    def perform_destroy(self, instance):
        delete_product(instance.id)
        instance.delete()


class RecommendationsView(APIView):
    """
    Рекомендации товаров (P8).

    - `?product_id=X` - item-to-item «с этим покупают»: матрица ко-покупок из C++.
      При недоступности C++/пустой матрице - fallback на популярное по той же категории.
    - без `product_id` - общие рекомендации (корзина, профиль): популярное по рейтингу.
      Это неслучайный fallback вместо прежних 100 случайных товаров.

    AllowAny: рекомендации - каталожные данные, не персональные. Блок «с этим
    покупают» виден и анонимам на публичной странице товара. Прежний контракт без
    параметров (CartPage/ProfilePage) сохранён - они просто получают популярное.

    Никогда не отдаёт 500: любая ошибка -> пустой список или fallback.
    """
    permission_classes = [permissions.AllowAny]
    N = 12

    def get(self, request):
        raw = request.query_params.get('product_id')
        try:
            product_id = int(raw) if raw not in (None, '') else None
        except (TypeError, ValueError):
            product_id = None  # кривой product_id -> деградируем до общих рекомендаций

        try:
            if product_id is not None:
                ids = self._copurchase_ids(product_id)
                products = _active_in_order(ids, exclude_id=product_id)[:self.N]
                if not products:
                    products = self._fallback_by_category(product_id)
            else:
                products = self._popular()
            data = ProductSerializer(products, many=True, context={'request': request}).data
            return Response(data)
        except Exception as e:
            logger.error(f'Recommendations error: {e}')
            return Response([])

    def _copurchase_ids(self, product_id):
        """Топ сопутствующих id от C++-рекомендатора. Любая проблема -> []."""
        try:
            resp = requests.get(
                settings.CPP_SERVICE_URL,
                params={'product_id': product_id},
                timeout=settings.CPP_SERVICE_TIMEOUT,
            )
            resp.raise_for_status()
            ids = resp.json().get('recommendations', [])
            return [int(i) for i in ids][:self.N]
        except Exception as e:
            # warning, не error: недоступный C++ - штатная ситуация, есть fallback
            logger.warning(f'C++ recommender unavailable for product {product_id}: {e}')
            return []

    def _fallback_by_category(self, product_id):
        """Холодный старт / C++ недоступен: популярное по категории товара."""
        try:
            product = Product.objects.get(id=product_id)
        except Product.DoesNotExist:
            return self._popular()
        qs = Product.objects.filter(status='active').exclude(id=product.id)
        if product.category_id:
            qs = qs.filter(category_id=product.category_id)
        return list(
            qs.select_related('category', 'seller').prefetch_related('images')
            .order_by('-rating', '-reviews_count')[:self.N]
        )

    def _popular(self):
        """Общие рекомендации: популярное по рейтингу (индексированная колонка P6a)."""
        return list(
            Product.objects.filter(status='active')
            .select_related('category', 'seller').prefetch_related('images')
            .order_by('-rating', '-reviews_count')[:self.N]
        )

# Допустимые сортировки отзывов: ключ из query -> поле order_by.
# new по умолчанию (свежие сверху, как Meta.ordering); по оценке - в обе стороны.
REVIEW_SORTS = {
    'new': '-created_at',
    'rating_desc': '-rating',
    'rating_asc': 'rating',
}


class ReviewListCreateView(generics.ListCreateAPIView):
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ReviewCreateSerializer
        return ReviewSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        qs = Review.objects.filter(product_id=self.kwargs['pk']).select_related('user')

        # Фильтр по оценке (1..5). Кривое значение игнорируем - выдача не падает.
        rating = self.request.query_params.get('rating')
        if rating:
            try:
                r = int(rating)
                if 1 <= r <= 5:
                    qs = qs.filter(rating=r)
            except (TypeError, ValueError):
                pass

        # Сортировка из белого списка; неизвестный ключ -> 'new'.
        sort = self.request.query_params.get('sort', 'new')
        return qs.order_by(REVIEW_SORTS.get(sort, '-created_at'))

    def list(self, request, *args, **kwargs):
        # Распределение по звёздам считаем по ВСЕМ отзывам товара (не под
        # фильтром rating), чтобы гистограмма не схлопывалась при фильтрации.
        # Средняя оценка тут НЕ дублируется - фронт берёт её из Product.rating
        # (единственный источник правды, денормализован сигналом P6a).
        counts = dict(
            Review.objects.filter(product_id=self.kwargs['pk'])
            .values_list('rating')
            .order_by('rating')
            .annotate(c=Count('id'))
        )
        distribution = {str(star): counts.get(star, 0) for star in range(1, 6)}

        response = super().list(request, *args, **kwargs)
        # super().list даёт пагинированный {count, next, previous, results}.
        if isinstance(response.data, dict):
            response.data['distribution'] = distribution
        else:
            response.data = {'results': response.data, 'distribution': distribution}
        return response

    def perform_create(self, serializer):
        from apps.orders.models import Order
        has_purchased = Order.objects.filter(
            buyer=self.request.user,
            items__product_id=self.kwargs['pk']
        ).exists()
        if not has_purchased:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Вы можете оставить отзыв только на купленный товар')
        serializer.save(
            user=self.request.user,
            product_id=self.kwargs['pk']
        )


class QuestionListCreateView(generics.ListCreateAPIView):
    """Q&A товара (Ф6): GET - вопросы с вложенными ответами (AllowAny);
    POST - задать вопрос (IsAuthenticated, покупка НЕ требуется, в отличие
    от Review - Q&A работает ДО покупки)."""
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return QuestionCreateSerializer
        return QuestionSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def _get_product(self):
        # Кэшируем на инстанс: 404 для несуществующего товара (и на GET, и POST).
        if not hasattr(self, '_product'):
            self._product = get_object_or_404(Product, pk=self.kwargs['pk'])
        return self._product

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        # seller_id для бейджа «Продавец» у ответов (вычисление на сервере).
        ctx['seller_id'] = self._get_product().seller_id
        return ctx

    def get_queryset(self):
        self._get_product()  # 404, если товара нет
        # Ответы сортируются Answer.Meta.ordering (-helpful_count, created_at).
        prefetches = [Prefetch('answers', queryset=Answer.objects.select_related('user'))]
        user = self.request.user
        if user.is_authenticated:
            # liked_by_me без N+1: голоса только текущего юзера.
            prefetches.append(
                Prefetch('answers__votes', queryset=AnswerVote.objects.filter(user=user))
            )
        return (
            Question.objects.filter(product_id=self.kwargs['pk'])
            .select_related('user')
            .prefetch_related(*prefetches)
        )

    def perform_create(self, serializer):
        serializer.save(user=self.request.user, product=self._get_product())


class AnswerCreateView(generics.CreateAPIView):
    """Ответить на вопрос (Ф6). Любой авторизованный (другой покупатель или
    продавец). Рабочее место продавца с агрегацией - Ф15."""
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = AnswerCreateSerializer

    def perform_create(self, serializer):
        # Вопрос привязан к товару из URL: чужой qid под другим товаром -> 404.
        question = get_object_or_404(
            Question, pk=self.kwargs['qid'], product_id=self.kwargs['pk']
        )
        serializer.save(user=self.request.user, question=question)


class AnswerHelpfulToggleView(APIView):
    """Переключить лайк «полезно» на ответе (Ф6). Toggle: повторный вызов
    снимает лайк. unique_together(answer, user) исключает накрутку повтором;
    helpful_count пересчитывается сигналом из AnswerVote."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, aid):
        answer = get_object_or_404(Answer, pk=aid)
        vote, created = AnswerVote.objects.get_or_create(answer=answer, user=request.user)
        if not created:
            vote.delete()
        # Сигнал уже пересчитал helpful_count - читаем свежее значение.
        answer.refresh_from_db(fields=['helpful_count'])
        return Response({'helpful_count': answer.helpful_count, 'liked_by_me': created})