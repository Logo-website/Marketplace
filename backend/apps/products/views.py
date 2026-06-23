import requests
from django.conf import settings
from django.db.models import Case, Count, Exists, IntegerField, OuterRef, Prefetch, Q, Value, When
from django.db.models.functions import Coalesce, Lower, NullIf
from django.utils import timezone
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import (
    Answer, AnswerVote, BrandFollow, Category, Look, LookItem, Product, Question,
    Report, Review, SellerReview,
)
from apps.users.models import User
from .serializers import (
    CategorySerializer, ProductSerializer, ProductWriteSerializer,
    ReviewSerializer, ReviewCreateSerializer, MyReviewSerializer,
    QuestionSerializer, QuestionCreateSerializer, AnswerCreateSerializer,
    SellerReviewSerializer, ReviewReplySerializer, SellerQuestionSerializer,
    RejectionSerializer, ReportCreateSerializer, ReportSerializer,
    BrandSerializer, BrandListSerializer, BrandReviewSerializer,
    BrandReviewCreateSerializer, LookListSerializer, LookDetailSerializer,
    RESOLUTION_NOTE_MAX,
)
from apps.cart.cart import try_add, get_cart
from apps.cart.views import build_cart_items
from .search import search_products, autocomplete, index_product, delete_product, PRICE_RANGES
from .size_charts import get_size_chart
from .caching import cache_get, cache_set
from .moderation import approve as approve_product, reject as reject_product, ModerationError
from . import moderation_ugc
from services.clickhouse_service import ClickHouseService
from apps.permissions import IsSeller, IsSellerOrAdmin, IsAdmin
import logging

logger = logging.getLogger(__name__)

CATEGORIES_CACHE_KEY = 'categories:root'
CATEGORIES_CACHE_TTL = 60 * 60  # категории меняются редко
PRODUCT_CACHE_KEY = 'product_detail:{}'
PRODUCT_CACHE_TTL = 60 * 5
# Кэш профиля витрины бренда (Ф20). Короткий TTL по образцу product_detail;
# инвалидация сигналом при отзыве о продавце и изменении его товара (signals.py).
BRAND_CACHE_KEY = 'brand:{}'
BRAND_CACHE_TTL = 60 * 5
# Кэш карточки образа (Ф22). Короткий TTL по образцу product_detail; инвалидация
# сигналом на Look/LookItem и при смене статуса вещи образа (signals.py).
LOOK_CACHE_KEY = 'look:{}'
LOOK_CACHE_TTL = 60 * 5
SIZE_CHART_CACHE_KEY = 'size_chart:{}'
SIZE_CHART_CACHE_TTL = 60 * 60  # размерный справочник меняется редко (как категории)


class CategoryListView(generics.ListAPIView):
    # prefetch на 2 уровня вглубь (root -> дети -> внуки) покрывает реальную
    # глубину каталога одежды без N+1; ответ кэшируется на час (categories:root).
    # is_visible=True (Ф19, узел 3.5): скрытая категория не показывается покупателю.
    # Фильтр живёт в самих Prefetch, поэтому сериализатор отдаёт children.all() уже
    # без скрытых, а защита от N+1 сохраняется (товары при этом не теряются -
    # Product.category on_delete=SET_NULL не трогаем).
    queryset = Category.objects.filter(parent=None, is_visible=True).prefetch_related(
        Prefetch('children', queryset=Category.objects.filter(is_visible=True).prefetch_related(
            Prefetch('children', queryset=Category.objects.filter(is_visible=True))
        ))
    )
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

    def paginate_queryset(self, queryset):
        # Ветка ?ids= (гостевая корзина Ф8) отдаёт все запрошенные товары без
        # пагинации - иначе хвост корзины «исчезнет» при отрисовке.
        if self.request.query_params.get('ids'):
            return None
        return super().paginate_queryset(queryset)

    def get_queryset(self):
        queryset = Product.objects.filter(status='active').select_related('category', 'seller').prefetch_related(
            'images')

        # Batch по списку id (гостевая корзина Ф8): товары по id одним запросом.
        # Только active - снятый/протухший товар не вернётся, фронт его почистит.
        ids = self.request.query_params.get('ids')
        if ids:
            id_list = [int(x) for x in ids.split(',') if x.strip().isdigit()]
            return queryset.filter(id__in=id_list)

        category_id = self.request.query_params.get('category')
        if category_id:
            queryset = queryset.filter(category_id=category_id)

        # Лента товаров бренда (Ф20, узел 1.21): ?seller=<id> сужает выдачу до
        # одного продавца, переиспользуя пагинацию/сортировку/фильтры Ф2 (DRY).
        # Базовое status='active' не снимается - скрытые/на модерации товары
        # продавца в витрину не утекают. Нечисловой id -> пустая лента, не 500.
        seller_id = self.request.query_params.get('seller')
        if seller_id:
            if seller_id.isdigit():
                queryset = queryset.filter(seller_id=int(seller_id))
            else:
                queryset = queryset.none()

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

        # Ф20: фасеты витрины бренда считаются по товарам одного продавца, чтобы
        # счётчики фильтров совпадали с лентой ?seller=. Нечисловой id -> нули.
        seller_id = params.get('seller')
        if seller_id:
            base = base.filter(seller_id=int(seller_id)) if seller_id.isdigit() else base.none()

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


def _reindex_product(product):
    """Синхронизация ES после сохранения формы (Ф12). В индексе - только active:
    черновик/на модерации в каталог и поиск не попадают (план 4.3). Правка
    active->moderation удаляет товар из индекса. Индексация best-effort: падение
    ES не валит сохранение товара (граничный случай плана, ES рассинхрон)."""
    try:
        if product.status == 'active':
            index_product(product)
        else:
            delete_product(product.id)
    except Exception as e:
        logger.warning(f'ES reindex skipped for product {product.id}: {e}')


class ProductCreateView(generics.CreateAPIView):
    serializer_class = ProductWriteSerializer
    permission_classes = [IsSeller]

    def perform_create(self, serializer):
        product = serializer.save()
        _reindex_product(product)


# Статусы реестра продавца (Ф13, узел 2.2): порядок вкладок-фильтра.
SELLER_STATUSES = ('active', 'hidden', 'moderation', 'rejected', 'draft')


class SellerProductListView(generics.ListAPIView):
    """Реестр товаров продавца (Ф13, узел 2.2). Фильтр ?status=<статус> отдаёт
    товары этого статуса; без параметра / ?status=all - все. В каждом ответе -
    counts по статусам (одним агрегатом), чтобы числа на вкладках не застывали
    после скрытия/удаления на отфильтрованной вкладке (план 5.1)."""
    serializer_class = ProductSerializer
    permission_classes = [IsSeller]

    def get_queryset(self):
        qs = (Product.objects.filter(seller=self.request.user)
              .select_related('category', 'seller').prefetch_related('images'))
        status = self.request.query_params.get('status')
        if status and status != 'all':
            # Неизвестный статус -> пустая выборка (а не вся), но только своих.
            qs = qs.filter(status=status)
        return qs

    def _status_counts(self):
        rows = list(
            Product.objects.filter(seller=self.request.user)
            .values('status').annotate(c=Count('id'))
        )
        counts = {s: 0 for s in SELLER_STATUSES}
        for r in rows:
            counts[r['status']] = r['c']  # незнакомый статус тоже попадёт в dict
        counts['all'] = sum(r['c'] for r in rows)
        return counts

    def list(self, request, *args, **kwargs):
        response = super().list(request, *args, **kwargs)
        counts = self._status_counts()
        # super().list даёт пагинированный {count, next, previous, results}.
        if isinstance(response.data, dict):
            response.data['counts'] = counts
        else:
            response.data = {'results': response.data, 'counts': counts}
        return response


class SellerProductUpdateView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsSeller]

    def get_serializer_class(self):
        # GET (предзаполнение формы редактирования) - полный read-сериализатор
        # с images/attributes; запись - ProductWriteSerializer.
        if self.request.method == 'GET':
            return ProductSerializer
        return ProductWriteSerializer

    def get_queryset(self):
        return Product.objects.filter(seller=self.request.user)

    def perform_update(self, serializer):
        product = serializer.save()
        _reindex_product(product)

    def perform_destroy(self, instance):
        delete_product(instance.id)
        instance.delete()


class SellerProductVisibilityView(APIView):
    """Скрыть / показать товар продавца (Ф13, узел 2.2).

    Узкий безопасный переход active <-> hidden. Любой другой исходный статус
    (moderation/rejected/draft) -> 400: иначе через «показать» продавец вывел бы
    в active товар, не прошедший модерацию (обход модерации, план 5.2). Владение -
    queryset по seller; чужой товар -> 404. После смены - переиндексация ES
    (скрытый уходит из каталога/поиска, показанный возвращается)."""
    permission_classes = [IsSeller]

    TRANSITIONS = {'active': 'hidden', 'hidden': 'active'}

    def post(self, request, pk):
        product = get_object_or_404(Product, pk=pk, seller=request.user)
        new_status = self.TRANSITIONS.get(product.status)
        if new_status is None:
            return Response(
                {'error': 'Скрыть или показать можно только товар, прошедший модерацию'},
                status=400,
            )
        product.status = new_status
        product.save(update_fields=['status', 'updated_at'])
        _reindex_product(product)
        return Response({'status': new_status})


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


class MyReviewsView(generics.ListAPIView):
    """Отзывы текущего пользователя (Ф10, кабинет). Только свои (S: персданные)."""
    serializer_class = MyReviewSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return (
            Review.objects.filter(user=self.request.user)
            .select_related('product')
            .prefetch_related('product__images')
        )


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
        # is_hidden=False (Ф18): скрытый модератором отзыв не виден публично.
        qs = (Review.objects.filter(product_id=self.kwargs['pk'], is_hidden=False)
              .select_related('user'))

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
            Review.objects.filter(product_id=self.kwargs['pk'], is_hidden=False)
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
        # is_hidden=False (Ф18): скрытый модератором ответ не виден, его лайки не
        # «всплывают» в сортировке по полезности (Этап 4, критерий).
        prefetches = [Prefetch(
            'answers',
            queryset=Answer.objects.filter(is_hidden=False).select_related('user'),
        )]
        user = self.request.user
        if user.is_authenticated:
            # liked_by_me без N+1: голоса только текущего юзера.
            prefetches.append(
                Prefetch('answers__votes', queryset=AnswerVote.objects.filter(user=user))
            )
        # is_hidden=False: скрытый вопрос пропадает из публичной ветки Q&A.
        return (
            Question.objects.filter(product_id=self.kwargs['pk'], is_hidden=False)
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


# === Ф15. Рабочее место продавца с обратной связью (узел 2.8) ===

def _answered_filter(qs, answered, empty_lookup):
    """Фильтр ?answered=true|false для кабинетных списков (Ф15). Мусорное
    значение -> «все» (не 500, граничный случай плана). empty_lookup - условие
    «без ответа продавца» (для отзывов и вопросов оно разное)."""
    if answered == 'true':
        return qs.exclude(**empty_lookup)
    if answered == 'false':
        return qs.filter(**empty_lookup)
    return qs


class SellerReviewListView(generics.ListAPIView):
    """Все отзывы на товары продавца в одном месте (Ф15, узел 2.8). Фильтр
    ?answered=true|false (есть/нет ответа), сортировка - без ответа сверху, внутри
    -created_at, чтобы необработанное было первым. Строго filter(product__seller),
    чужие отзывы не отдаются (часть 9)."""
    serializer_class = SellerReviewSerializer
    permission_classes = [IsSellerOrAdmin]

    def get_queryset(self):
        qs = (Review.objects.filter(product__seller=self.request.user)
              .select_related('user', 'product'))
        qs = _answered_filter(qs, self.request.query_params.get('answered'),
                              {'seller_reply': ''})
        # _answered=0 (нет ответа) сверху, внутри - свежие первыми.
        return qs.annotate(
            _answered=Case(When(seller_reply='', then=Value(0)),
                           default=Value(1), output_field=IntegerField())
        ).order_by('_answered', '-created_at')


class ReviewReplyView(APIView):
    """Создать/изменить ответ продавца на отзыв (Ф15, узел 2.8). Владение:
    только продавец товара (review.product.seller) или админ - иначе 403
    (анти-подмена магазина, зеркало S4). Отзыв не найден -> 404. Ответ 1:1:
    повторный POST перезаписывает, дубля нет (поле на Review, решение 4.1)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        review = get_object_or_404(Review.objects.select_related('product'), pk=pk)
        is_owner = review.product.seller_id == request.user.id
        is_admin = getattr(request.user, 'role', None) == 'admin'
        if not (is_owner or is_admin):
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Отвечать можно только на отзывы о своих товарах')
        serializer = ReviewReplySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        review.seller_reply = serializer.validated_data['text']
        review.seller_reply_at = timezone.now()
        review.save(update_fields=['seller_reply', 'seller_reply_at'])
        # Точка расширения Ф25 (часть 4.5): уведомление покупателю «вам ответили» -
        # отдельная фаза; здесь рассылку не делаем.
        return Response(ReviewSerializer(review).data)


class SellerQuestionListView(generics.ListAPIView):
    """Все вопросы по товарам продавца (Ф15, узел 2.8; надстройка над Q&A Ф6).
    Ответ продавец шлёт в существующий answer-эндпоинт Ф6 (своего write нет, 4.2).
    Сортировка - без ответа продавца сверху; фильтр ?answered=true|false. Строго
    filter(product__seller), чужие вопросы не отдаются (часть 9)."""
    serializer_class = SellerQuestionSerializer
    permission_classes = [IsSellerOrAdmin]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        # Все вопросы - по своим товарам, значит «ответ продавца» = ответ текущего
        # пользователя (бейдж «Продавец» через AnswerSerializer.is_seller_answer).
        ctx['seller_id'] = self.request.user.id
        return ctx

    def get_queryset(self):
        user = self.request.user
        # Ответы продавца = ответы автора-продавца на свой товар (user == seller).
        qs = Question.objects.filter(product__seller=user).annotate(
            _seller_answers=Count('answers', filter=Q(answers__user=user))
        )
        qs = _answered_filter(qs, self.request.query_params.get('answered'),
                              {'_seller_answers': 0})
        return (
            qs.select_related('user', 'product')
            .prefetch_related(
                Prefetch('answers', queryset=Answer.objects.select_related('user')),
                Prefetch('answers__votes', queryset=AnswerVote.objects.filter(user=user)),
            )
            .order_by('_seller_answers', '-created_at')
        )


# === Ф17. Модерация товаров (узел 3.2, только админ) ===

class ModerationQueueView(generics.ListAPIView):
    """Очередь модерации (Ф17): товары status='moderation', новые сверху.
    Только админ (IsAdmin) - барьер качества каталога. Отдаёт ProductSerializer:
    в нём seller_name = публичное имя магазина (НЕ email, S17), фото, attributes,
    цена - всё, по чему админ решает, без утечки PII продавца/покупателей."""
    serializer_class = ProductSerializer
    permission_classes = [IsAdmin]

    def get_queryset(self):
        return (
            Product.objects.filter(status='moderation')
            .select_related('category', 'seller').prefetch_related('images')
            .order_by('-created_at')
        )


class ModerationApproveView(APIView):
    """Одобрить товar: moderation -> active (Ф17). Несуществующий id -> 404,
    повторное/конкурентное действие -> 409 (товар уже промодерирован)."""
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        try:
            approve_product(product, request.user)
        except ModerationError as e:
            return Response({'error': str(e)}, status=409)
        # TODO Ф25/Ф16: уведомить продавца «товар прошёл модерацию» (forward).
        return Response({'status': product.status})


class ModerationRejectView(APIView):
    """Отклонить товар с причиной: moderation -> rejected (Ф17). Причина
    обязательна (RejectionSerializer -> 400 на пустой). id не найден -> 404,
    повторное действие -> 409."""
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        product = get_object_or_404(Product, pk=pk)
        serializer = RejectionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            reject_product(product, serializer.validated_data['reason'], request.user)
        except ModerationError as e:
            return Response({'error': str(e)}, status=409)
        # TODO Ф25/Ф16: уведомить продавца «товар отклонён с причиной» (forward).
        return Response({'status': product.status,
                         'rejection_reason': product.rejection_reason})


# === Ф18. Жалобы и модерация UGC (узел 3.8 + «пожаловаться» из 1.5) ===

class ReportListCreateView(generics.ListCreateAPIView):
    """Один view на /reports/ (паттерн ReviewListCreateView): POST - создать
    жалобу (любой авторизованный); GET - очередь жалоб (только админ). Права и
    сериализатор переключаются по методу (план §4.4). На POST контракт: новая
    жалоба -> 201, дубль открытой -> 200 (дедуп в сериализаторе)."""

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ReportCreateSerializer
        return ReportSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated()]
        return [IsAdmin()]

    def get_queryset(self):
        # Очередь: по умолчанию open (необработанные), новые сверху; ?status= -
        # фильтр по конкретному статусу, ?status=all - все. Неизвестный -> open.
        status = self.request.query_params.get('status', 'open')
        qs = Report.objects.all().order_by('-created_at')
        if status != 'all':
            valid = {s[0] for s in Report.STATUS_CHOICES}
            qs = qs.filter(status=status if status in valid else 'open')
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        report = serializer.save()
        # 201 - новая жалоба; 200 - вернули существующую открытую (дедуп, §4.4 B).
        created = getattr(serializer, '_created', True)
        out = ReportSerializer(report, context=self.get_serializer_context())
        return Response(out.data, status=201 if created else 200)


class ReportResolveView(APIView):
    """Решить жалобу с действием над целью (скрыть UGC / снять товар) - только
    админ. Повторная/конкурентная обработка уже закрытой жалобы -> 409 (§6)."""
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        report = get_object_or_404(Report, pk=pk)
        note = (request.data.get('note') or '')[:RESOLUTION_NOTE_MAX]
        try:
            moderation_ugc.resolve_report(report, request.user, note)
        except ModerationError as e:
            return Response({'error': str(e)}, status=409)
        # TODO Ф25: уведомить автора «контент скрыт» и жалобщика «жалоба обработана».
        return Response({'status': report.status})


class ReportDismissView(APIView):
    """Отклонить жалобу (нарушения нет): цель не трогаем - только админ. Повторная
    обработка -> 409 (§6)."""
    permission_classes = [IsAdmin]

    def post(self, request, pk):
        report = get_object_or_404(Report, pk=pk)
        note = (request.data.get('note') or '')[:RESOLUTION_NOTE_MAX]
        try:
            moderation_ugc.dismiss_report(report, request.user, note)
        except ModerationError as e:
            return Response({'error': str(e)}, status=409)
        return Response({'status': report.status})


class UGCModerationView(APIView):
    """Проактивное скрытие/возврат UGC без жалобы (узел 3.8 «модерация отзывов и
    вопросов») - только админ. Модель и направление (hide/unhide) задаются в
    маршруте через as_view(model=..., hide=...). Идемпотентность - в сервисе (§6)."""
    permission_classes = [IsAdmin]
    model = None
    hide = True

    def post(self, request, pk):
        obj = get_object_or_404(self.model, pk=pk)
        if self.hide:
            reason = (request.data.get('reason') or '')[:RESOLUTION_NOTE_MAX]
            moderation_ugc.hide_ugc(obj, request.user, reason)
        else:
            moderation_ugc.unhide_ugc(obj, request.user)
        return Response({'id': obj.id, 'is_hidden': obj.is_hidden})


# === Ф20. Витрина бренда (узел 1.21) ===

class BrandStorefrontView(APIView):
    """Публичный профиль витрины бренда (Ф20). AllowAny - витрина публична, как
    каталог. БЕЗ PII продавца (S17): BrandSerializer не отдаёт email/phone. id не
    продавца / заблокированного (is_active=False, Ф19) / несуществующего -> 404,
    не 500. Кэш brand:{id}, инвалидируется сигналом при отзыве о продавце и при
    изменении его товара (число товаров в шапке устаревает)."""
    permission_classes = [permissions.AllowAny]

    def get(self, request, pk):
        cache_key = BRAND_CACHE_KEY.format(pk)
        data = cache_get(cache_key)
        if data is None:
            seller = get_object_or_404(User, pk=pk, role='seller', is_active=True)
            products_count = Product.objects.filter(seller=seller, status='active').count()
            data = BrandSerializer(seller, context={'products_count': products_count}).data
            cache_set(cache_key, data, BRAND_CACHE_TTL)
        return Response(data)


class BrandReviewListCreateView(generics.ListCreateAPIView):
    """Отзывы о продавце (Ф20, отдельно от товарных). GET - публичный список
    (AllowAny, автор - username, не email); POST - создать (IsAuthenticated +
    купил у продавца + не сам себе + не повторно). seller из URL pk; не продавец
    -> 404. Ответ продавца на отзыв - это Ф15, здесь не делаем."""
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return BrandReviewCreateSerializer
        return BrandReviewSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def _get_seller(self):
        if not hasattr(self, '_seller'):
            self._seller = get_object_or_404(
                User, pk=self.kwargs['pk'], role='seller', is_active=True
            )
        return self._seller

    def get_queryset(self):
        self._get_seller()  # 404, если id не продавца
        return (SellerReview.objects.filter(seller_id=self.kwargs['pk'])
                .select_related('author'))

    def perform_create(self, serializer):
        from apps.orders.models import Order
        from rest_framework.exceptions import PermissionDenied, ValidationError
        seller = self._get_seller()
        user = self.request.user
        # Сам себе - нельзя (продавец не накручивает свой рейтинг).
        if seller.id == user.id:
            raise PermissionDenied('Нельзя оставить отзыв самому себе')
        # Только купивший у продавца (по образцу товарного отзыва «если купил»).
        has_purchased = Order.objects.filter(
            buyer=user, items__product__seller_id=seller.id
        ).exists()
        if not has_purchased:
            raise PermissionDenied('Отзыв о продавце можно оставить только после покупки у него')
        # Повторный отзыв (нарушил бы unique_together) -> 400 явным сообщением.
        if SellerReview.objects.filter(seller=seller, author=user).exists():
            raise ValidationError('Вы уже оставляли отзыв об этом продавце')
        serializer.save(seller=seller, author=user)


class BrandFollowView(APIView):
    """Подписка на бренд (Ф20, узел 1.21). POST - toggle (IsAuthenticated,
    идемпотентно, не на себя); GET - статус для отрисовки кнопки (гостю following
    false, без 401 в лицо). Подписка серверная (питает Ф25); само уведомление
    подписчику - Ф25, в Ф20 наружу ничего не шлём."""
    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def get(self, request, pk):
        seller = get_object_or_404(User, pk=pk, role='seller', is_active=True)
        following = bool(
            request.user.is_authenticated
            and BrandFollow.objects.filter(follower=request.user, seller=seller).exists()
        )
        return Response({'following': following})

    def post(self, request, pk):
        from rest_framework.exceptions import PermissionDenied
        seller = get_object_or_404(User, pk=pk, role='seller', is_active=True)
        if seller.id == request.user.id:
            raise PermissionDenied('Нельзя подписаться на свой магазин')
        # get_or_create + delete = идемпотентный toggle (двойной клик не плодит дубль).
        follow, created = BrandFollow.objects.get_or_create(
            follower=request.user, seller=seller
        )
        if not created:
            follow.delete()
        # TODO Ф25: уведомление подписчику о новинках/акциях - отдельная фаза.
        return Response({'following': created})


# === Ф21. Каталог брендов (узел 1.22) ===

# Сортировки каталога брендов: ключ из ?sort= -> поле order_by. alpha по умолчанию
# (узел 1.22 «алфавитный список»). new питает подборку «новые бренды» (по дате
# регистрации продавца), popular - по числу товаров и рейтингу продавца.
BRAND_SORTS = ('alpha', 'popular', 'new')


class BrandListView(generics.ListAPIView):
    """Индекс брендов (Ф21, узел 1.22). Бренд = User(role=seller) с хотя бы одним
    активным товаром (пустую витрину открывать незачем, §4.1). Публичный (AllowAny),
    как каталог. БЕЗ PII (S17, §9): BrandListSerializer не отдаёт email/phone.

    product_count - аннотация Count активных товаров (один запрос, без N+1).
    Категорийный фильтр - через Exists (подзапрос не размножает строки и не ломает
    Count, ловушка multi-valued relations §4.2). Поиск ?q= по имени магазина/логину,
    сортировка ?sort=alpha|popular|new, пагинация - глобальная (PAGE_SIZE=20)."""
    serializer_class = BrandListSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        params = self.request.query_params
        active_products = Q(products__status='active')
        qs = (
            User.objects.filter(role='seller', is_active=True)
            # seller_profile (Ф11) - reverse OneToOne; логотип/описание карточки
            # берутся из него. select_related, иначе сериализатор тянет профиль
            # по продавцу = N+1 на список (критерий «один запрос», §4.2/§10).
            .select_related('seller_profile')
            .annotate(product_count=Count('products', filter=active_products, distinct=True))
            .filter(product_count__gt=0)
        )

        # Категория: бренды, у кого есть активный товар в ней (Exists, не JOIN -
        # product_count остаётся «всего активных товаров», §4.2). Нечисло -> игнор.
        category_id = params.get('category')
        if category_id and category_id.isdigit():
            qs = qs.filter(Exists(
                Product.objects.filter(
                    seller=OuterRef('pk'), status='active', category_id=int(category_id)
                )
            ))

        # Поиск по публичному имени: shop_name или username (icontains), без PII.
        q = (params.get('q') or '').strip()
        if q:
            qs = qs.filter(Q(shop_name__icontains=q) | Q(username__icontains=q))

        sort = params.get('sort', 'alpha')
        if sort == 'popular':
            return qs.order_by('-product_count', '-seller_rating', 'id')
        if sort == 'new':
            return qs.order_by('-date_joined', 'id')
        # alpha (дефолт и неизвестный ключ): по имени бренда без учёта регистра.
        # display_name = shop_name, а если пустой - username (тот же fallback, что
        # в выдаче имени), чтобы продавцы без shop_name не «всплывали» пустыми.
        return qs.annotate(
            display_name=Coalesce(NullIf('shop_name', Value('')), 'username')
        ).order_by(Lower('display_name'), 'id')


# === Ф22. Образы / лукбук (узел 1.23) ===

def _looks_with_items():
    """Опубликованные образы с предзагруженными вещами (без N+1). Вещи тянем через
    LookItem с select_related товара/категории/продавца и prefetch фото - этого
    хватает и ленте (статус/цена), и карточке (ProductSerializer: images, category_name,
    seller_name, size_group)."""
    item_qs = LookItem.objects.select_related(
        'product__category', 'product__seller'
    ).prefetch_related('product__images').order_by('order')
    return (
        Look.objects.filter(is_published=True)
        .select_related('seller')
        .prefetch_related(Prefetch('items', queryset=item_qs))
    )


class LookListView(generics.ListAPIView):
    """Лента образов (Ф22, §4.2). Публичная (AllowAny), только is_published, новые
    сверху. Фильтры: ?source=editorial|brand, ?seller=<id> (вход с витрины бренда
    Ф20), ?contains=<product_id> (вход «собрать образ» с карточки товара Ф4).
    Неопубликованные образы и вещи не-active в выдачу не утекают (§8)."""
    serializer_class = LookListSerializer
    permission_classes = [permissions.AllowAny]

    def get_queryset(self):
        params = self.request.query_params
        qs = _looks_with_items().order_by('-created_at')

        source = params.get('source')
        if source in ('editorial', 'brand'):
            qs = qs.filter(source=source)

        # Образы бренда (Ф20). Нечисловой id -> пустая лента, не 500.
        seller_id = params.get('seller')
        if seller_id:
            qs = qs.filter(seller_id=int(seller_id)) if seller_id.isdigit() else qs.none()

        # Образы, содержащие конкретный товар (вход «собрать образ» Ф4, §4.5).
        # distinct: товар в образе один (unique_together), но фильтр по m2m без
        # distinct может задвоить строку. Нечисло -> пустая лента.
        contains = params.get('contains')
        if contains:
            qs = (qs.filter(items__product_id=int(contains)).distinct()
                  if contains.isdigit() else qs.none())

        return qs


class LookDetailView(generics.RetrieveAPIView):
    """Карточка образа (Ф22, §4.3). Публичная, кэш look:{id}. Отдаёт образ + все
    активные вещи через ProductSerializer. is_published=False / нет id -> 404."""
    permission_classes = [permissions.AllowAny]

    def retrieve(self, request, *args, **kwargs):
        pk = kwargs.get('pk')
        cache_key = LOOK_CACHE_KEY.format(pk)
        data = cache_get(cache_key)
        if data is None:
            look = get_object_or_404(_looks_with_items(), pk=pk)  # 404 если не is_published
            data = LookDetailSerializer(look, context={'request': request}).data
            cache_set(cache_key, data, LOOK_CACHE_TTL)
        return Response(data)


class LookAddToCartView(APIView):
    """«Весь образ в корзину» (Ф22, §4.4). Батч поверх валидации Ф8 (cart.try_add):
    добавляет активные вещи образа, недоступные (нет остатка) честно пропускает.
    IsAuthenticated - кладёт только в корзину текущего пользователя (§8). Частичный
    успех - штатный результат, не 500: возвращает {added, skipped, cart}."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        look = get_object_or_404(Look.objects.filter(is_published=True), pk=pk)
        items = (
            look.items.filter(product__status='active')
            .select_related('product').order_by('order')
        )
        added, skipped = [], []
        for item in items:
            # Каждая вещь проходит ту же проверку остатка, что одиночное добавление
            # (батч не способ «налить» больше склада, §8). Количество - по одной.
            result = try_add(request.user.id, item.product_id, 1)
            if result['ok']:
                added.append(item.product_id)
            else:
                skipped.append({'product_id': item.product_id, 'reason': result['reason']})
        cart_items, total = build_cart_items(get_cart(request.user.id))
        return Response({
            'added': added,
            'skipped': skipped,
            'cart': {'items': cart_items, 'total': str(total)},
        })