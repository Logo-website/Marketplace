import pytest
from django.core.cache import cache
from rest_framework.test import APIClient
from apps.products.models import Answer, Category, Product, Question, Report, Review
from apps.users.models import User


@pytest.fixture
def category(db):
    return Category.objects.create(name='Электроника', slug='electronics')


@pytest.fixture
def product(db, seller, category):
    return Product.objects.create(
        seller=seller,
        category=category,
        name='Тестовый товар',
        slug='test-product',
        description='Описание',
        price=1000,
        stock=10,
        status='active'
    )


@pytest.fixture(autouse=True)
def clear_cache():
    """Кэш P6b - реальный Redis в тестовом окружении; чистим до и после теста,
    чтобы карточки/категории не протекали между тестами."""
    cache.clear()
    yield
    cache.clear()


@pytest.mark.django_db
def test_product_list(api_client, product):
    response = api_client.get('/api/products/')
    assert response.status_code == 200
    assert len(response.data['results']) == 1


@pytest.mark.django_db
def test_product_detail(api_client, product):
    response = api_client.get(f'/api/products/{product.id}/')
    assert response.status_code == 200
    assert response.data['name'] == 'Тестовый товар'


@pytest.mark.django_db
def test_create_product(seller_client, category):
    response = seller_client.post('/api/products/create/', {
        'name': 'Новый товар',
        'slug': 'new-product',
        'description': 'Описание',
        'price': 500,
        'stock': 5,
        'category': category.id
    })
    assert response.status_code == 201


@pytest.mark.django_db
def test_create_product_unauthorized(api_client, category):
    response = api_client.post('/api/products/create/', {
        'name': 'Новый товар',
        'slug': 'new-product',
        'price': 500,
        'stock': 5,
        'category': category.id
    })
    assert response.status_code == 401


# --- Ф1: дерево категорий в каталог-меню ---

@pytest.mark.django_db
def test_categories_return_nested_children(api_client, category):
    """GET /categories/ отдаёт корни с вложенными children (дерево для меню)."""
    child = Category.objects.create(name='Смартфоны', slug='smartphones', parent=category)
    Category.objects.create(name='Чехлы', slug='cases', parent=child)  # внук, глубина 2

    response = api_client.get('/api/products/categories/')
    assert response.status_code == 200
    roots = response.data
    # в ответе только корень (parent=None), дети - вложенно
    assert len(roots) == 1
    assert roots[0]['id'] == category.id
    assert [c['id'] for c in roots[0]['children']] == [child.id]
    # рекурсия идёт вглубь: у ребёнка виден его ребёнок
    assert roots[0]['children'][0]['children'][0]['name'] == 'Чехлы'


# --- P6a: денормализация рейтинга ---

@pytest.mark.django_db
def test_rating_denormalized_on_review_create(product, user):
    assert product.rating == 0
    assert product.reviews_count == 0
    Review.objects.create(product=product, user=user, rating=4, text='ок')
    product.refresh_from_db()
    assert product.rating == 4
    assert product.reviews_count == 1


@pytest.mark.django_db
def test_rating_is_average_of_reviews(product, user):
    u2 = User.objects.create_user(username='u2', email='u2@t.com', password='testpass123', role='buyer')
    Review.objects.create(product=product, user=user, rating=5, text='супер')
    Review.objects.create(product=product, user=u2, rating=2, text='так себе')
    product.refresh_from_db()
    assert product.rating == 3.5
    assert product.reviews_count == 2


@pytest.mark.django_db
def test_rating_recalc_on_review_delete(product, user):
    u2 = User.objects.create_user(username='u2', email='u2@t.com', password='testpass123', role='buyer')
    r1 = Review.objects.create(product=product, user=user, rating=5, text='супер')
    Review.objects.create(product=product, user=u2, rating=1, text='плохо')
    r1.delete()
    product.refresh_from_db()
    assert product.rating == 1
    assert product.reviews_count == 1


@pytest.mark.django_db
def test_rating_zero_when_all_reviews_deleted(product, user):
    r = Review.objects.create(product=product, user=user, rating=5, text='супер')
    r.delete()
    product.refresh_from_db()
    assert product.rating == 0
    assert product.reviews_count == 0


@pytest.mark.django_db
def test_rating_exposed_in_api(api_client, product, user):
    Review.objects.create(product=product, user=user, rating=4, text='ок')
    response = api_client.get(f'/api/products/{product.id}/')
    assert response.status_code == 200
    assert response.data['rating'] == 4
    assert response.data['reviews_count'] == 1


@pytest.mark.django_db
def test_sort_by_rating(api_client, seller, category, user):
    low = Product.objects.create(seller=seller, category=category, name='Низкий',
                                 slug='low', price=100, stock=5, status='active')
    high = Product.objects.create(seller=seller, category=category, name='Высокий',
                                  slug='high', price=100, stock=5, status='active')
    Review.objects.create(product=low, user=user, rating=2, text='средне')
    u2 = User.objects.create_user(username='u2', email='u2@t.com', password='testpass123', role='buyer')
    Review.objects.create(product=high, user=u2, rating=5, text='топ')
    response = api_client.get('/api/products/?sort=rating')
    ids = [p['id'] for p in response.data['results']]
    assert ids.index(high.id) < ids.index(low.id)


# --- P6b: кэш карточки и его инвалидация ---

@pytest.mark.django_db
def test_product_detail_served_from_cache(api_client, product):
    cache_key = f'product_detail:{product.id}'
    assert cache.get(cache_key) is None
    api_client.get(f'/api/products/{product.id}/')
    assert cache.get(cache_key) is not None


@pytest.mark.django_db
def test_review_invalidates_product_cache(api_client, product, user):
    api_client.get(f'/api/products/{product.id}/')
    cache_key = f'product_detail:{product.id}'
    assert cache.get(cache_key) is not None
    Review.objects.create(product=product, user=user, rating=5, text='ок')
    # сигнал пересчёта рейтинга должен сбросить кэш карточки
    assert cache.get(cache_key) is None


# --- P7: поиск, фасеты, автокомплит ---

@pytest.mark.django_db
def test_search_empty_query_returns_400(api_client):
    response = api_client.get('/api/products/search/?q=')
    assert response.status_code == 400


@pytest.mark.django_db
def test_search_es_down_returns_503(api_client, monkeypatch):
    """ES недоступен - явная ошибка 503 (а не ложное «ничего не найдено»),
    чтобы фронт показал ErrorState, а не пустую выдачу (план Ф3, решение 6)."""
    def boom():
        raise ConnectionError('ES down')
    monkeypatch.setattr('apps.products.search.get_es', boom)

    response = api_client.get('/api/products/search/?q=куртка')
    assert response.status_code == 503


@pytest.mark.django_db
def test_search_contract_with_facets(api_client, product, category, monkeypatch):
    """View собирает контракт: count, results в порядке ES, фасеты с именами
    категорий, suggestion проброшен."""
    def fake_search(query, **kwargs):
        return {
            'ids': [product.id],
            'total': 1,
            'facets': {
                'categories': [{'id': category.id, 'count': 1}],
                'price_ranges': [{'key': '0-1000', 'from': None, 'to': 1000, 'count': 1}],
                'brands': [{'value': 'Nike', 'count': 1}],
                'rating_thresholds': [{'value': 4, 'count': 0}],
                'in_stock_count': 1,
            },
            'suggestion': 'куртка',
            'error': False,
        }
    monkeypatch.setattr('apps.products.views.search_products', fake_search)

    response = api_client.get('/api/products/search/?q=товар')
    assert response.status_code == 200
    assert response.data['count'] == 1
    assert [p['id'] for p in response.data['results']] == [product.id]
    cat_facet = response.data['facets']['categories'][0]
    assert cat_facet['id'] == category.id
    assert cat_facet['name'] == category.name  # обогащено именем из БД
    assert response.data['facets']['price_ranges'][0]['count'] == 1
    assert response.data['facets']['brands'][0]['value'] == 'Nike'
    assert response.data['facets']['in_stock_count'] == 1
    assert response.data['suggestion'] == 'куртка'


class _FakeES:
    """ES-клиент-заглушка: запоминает тело запроса, отдаёт заранее заданный ответ."""
    def __init__(self, response):
        self._response = response
        self.last_body = None

    def search(self, index, body):
        self.last_body = body
        return self._response


def _es_response(**extra):
    base = {'hits': {'hits': [], 'total': {'value': 0}}, 'aggregations': {}}
    base.update(extra)
    return base


def test_search_filters_go_into_post_filter(monkeypatch):
    """Бренд/рейтинг/наличие попадают в post_filter ES-запроса (сужают выдачу,
    как фильтры каталога Ф2)."""
    from apps.products import search as search_mod
    fake = _FakeES(_es_response())
    monkeypatch.setattr(search_mod, 'get_es', lambda: fake)

    search_mod.search_products('куртка', brands=['Nike'], min_rating=4, in_stock=True)
    pf = fake.last_body['post_filter']['bool']['filter']
    assert {'terms': {'brand': ['Nike']}} in pf
    assert {'range': {'rating': {'gte': 4}}} in pf
    assert {'term': {'in_stock': True}} in pf


def test_search_sort_maps_to_es_sort(monkeypatch):
    """sort=price_asc -> ES sort по цене; неизвестный sort -> релевантность (без sort)."""
    from apps.products import search as search_mod
    fake = _FakeES(_es_response())
    monkeypatch.setattr(search_mod, 'get_es', lambda: fake)

    search_mod.search_products('куртка', sort='price_asc')
    assert fake.last_body['sort'] == [{'price': 'asc'}]

    search_mod.search_products('куртка', sort='нечто-кривое')
    assert 'sort' not in fake.last_body  # откат к релевантности (_score)


def test_search_suggestion_on_typo_and_none_on_exact(monkeypatch):
    """Опечатка -> suggestion; точный запрос (нет опций) -> None."""
    from apps.products import search as search_mod

    typo = _FakeES(_es_response(suggest={
        'did_you_mean': [{'text': 'куатка', 'options': [{'text': 'куртка'}]}]
    }))
    monkeypatch.setattr(search_mod, 'get_es', lambda: typo)
    assert search_mod.search_products('куатка')['suggestion'] == 'куртка'

    exact = _FakeES(_es_response(suggest={
        'did_you_mean': [{'text': 'куртка', 'options': []}]
    }))
    monkeypatch.setattr(search_mod, 'get_es', lambda: exact)
    assert search_mod.search_products('куртка')['suggestion'] is None


def test_search_products_error_flag_when_es_down(monkeypatch):
    """search_products при сбое ES возвращает error=True (не пустой результат)."""
    from apps.products import search as search_mod
    def boom():
        raise ConnectionError('ES down')
    monkeypatch.setattr(search_mod, 'get_es', boom)

    result = search_mod.search_products('куртка')
    assert result['error'] is True
    assert result['ids'] == []


@pytest.mark.django_db
def test_autocomplete_short_query_returns_empty(api_client):
    response = api_client.get('/api/products/autocomplete/?q=a')
    assert response.status_code == 200
    assert response.data == []


@pytest.mark.django_db
def test_autocomplete_graceful_when_es_down(api_client, monkeypatch):
    def boom(*args, **kwargs):
        raise ConnectionError('ES down')
    monkeypatch.setattr('apps.products.search.get_es', boom)

    response = api_client.get('/api/products/autocomplete/?q=куртка')
    assert response.status_code == 200
    assert response.data == []


@pytest.mark.django_db
def test_autocomplete_contract(api_client, product, monkeypatch):
    """Автокомплит отдаёт лёгкие поля без полной выдачи."""
    monkeypatch.setattr('apps.products.views.autocomplete', lambda q: [product.id])

    response = api_client.get('/api/products/autocomplete/?q=тестовый')
    assert response.status_code == 200
    assert len(response.data) == 1
    item = response.data[0]
    assert set(item.keys()) == {'id', 'name', 'price', 'category_name', 'image_url'}
    assert item['id'] == product.id


# --- P8: рекомендации (ко-покупки C++ + неслучайный fallback) ---

def _mk(seller, category, name, slug, price=100):
    return Product.objects.create(seller=seller, category=category, name=name,
                                  slug=slug, price=price, stock=5, status='active')


@pytest.mark.django_db
def test_recommendations_general_popular_for_anon(api_client, seller, category, user):
    """Без product_id (контракт корзины/профиля) - популярное по рейтингу, не случайное.
    AllowAny: анонимный клиент получает 200."""
    low = _mk(seller, category, 'Низкий', 'p-low')
    high = _mk(seller, category, 'Высокий', 'p-high')
    Review.objects.create(product=low, user=user, rating=2, text='средне')
    u2 = User.objects.create_user(username='u2', email='u2@t.com', password='testpass123', role='buyer')
    Review.objects.create(product=high, user=u2, rating=5, text='топ')

    response = api_client.get('/api/products/recommendations/')
    assert response.status_code == 200
    ids = [p['id'] for p in response.data]
    assert ids.index(high.id) < ids.index(low.id)  # по рейтингу, не случайно


@pytest.mark.django_db
def test_recommendations_fallback_when_cpp_down(api_client, product, seller, category, monkeypatch):
    """C++ недоступен -> 200 и fallback на популярное по категории, не 500."""
    def boom(*args, **kwargs):
        raise ConnectionError('C++ down')
    monkeypatch.setattr('apps.products.views.requests.get', boom)

    same_cat = _mk(seller, category, 'Сосед по категории', 'p-neighbor')

    response = api_client.get(f'/api/products/recommendations/?product_id={product.id}')
    assert response.status_code == 200
    ids = [p['id'] for p in response.data]
    assert same_cat.id in ids
    assert product.id not in ids  # сам товар исключён


@pytest.mark.django_db
def test_recommendations_use_cpp_matrix_and_filter_inactive(api_client, product, seller, category, monkeypatch):
    """C++ вернул матрицу: активные товары в порядке матрицы, неактивный отфильтрован."""
    rec_active = _mk(seller, category, 'Сопутствующий', 'p-rec')
    rec_hidden = Product.objects.create(seller=seller, category=category, name='Скрытый',
                                        slug='p-hidden', price=100, stock=5, status='hidden')

    class FakeResp:
        def raise_for_status(self): pass
        def json(self): return {'recommendations': [rec_active.id, rec_hidden.id]}
    monkeypatch.setattr('apps.products.views.requests.get', lambda *a, **k: FakeResp())

    response = api_client.get(f'/api/products/recommendations/?product_id={product.id}')
    assert response.status_code == 200
    ids = [p['id'] for p in response.data]
    assert rec_active.id in ids
    assert rec_hidden.id not in ids  # скрытый товар не утекает в рекомендации


@pytest.mark.django_db
def test_recommendations_invalid_product_id_degrades(api_client, product):
    """Кривой product_id не роняет - деградирует до общих рекомендаций, 200."""
    response = api_client.get('/api/products/recommendations/?product_id=abc')
    assert response.status_code == 200


@pytest.mark.django_db
def test_seller_email_not_exposed_in_catalog(api_client, product, seller):
    """S17: каталог отдаётся анонимам - email продавца не должен утекать.
    seller_name = публичное имя (shop_name или username), не email."""
    response = api_client.get(f'/api/products/{product.id}/')
    assert response.status_code == 200
    assert response.data['seller_name'] != seller.email
    assert '@' not in response.data['seller_name']
    # без shop_name отдаётся username как публичный хэндл
    assert response.data['seller_name'] == seller.username


@pytest.mark.django_db
def test_seller_cannot_self_approve_via_patch(seller_client, seller, category):
    """Безопасность (Ф12, план 9): продавец не может PATCH'ем выставить
    status=active и обойти модерацию. Целевой статус формы ограничен
    draft|moderation - active отклоняется явной 400, не молча игнорируется."""
    pending = Product.objects.create(
        seller=seller, category=category, name='На модерации',
        slug='pending', price=500, stock=3, status='moderation'
    )
    response = seller_client.patch(f'/api/products/my/{pending.id}/', {'status': 'active'})
    assert response.status_code == 400  # active вне choices write-сериализатора
    pending.refresh_from_db()
    assert pending.status == 'moderation'  # самоодобрение заблокировано


@pytest.mark.django_db
def test_seller_shop_name_used_when_set(api_client, product, seller):
    """Если у продавца задан shop_name - отдаётся он, а не username."""
    seller.shop_name = 'Бренд Премиум'
    seller.save(update_fields=['shop_name'])
    cache.clear()  # карточка кэшируется (P6b) - сбросить старую сериализацию
    response = api_client.get(f'/api/products/{product.id}/')
    assert response.status_code == 200
    assert response.data['seller_name'] == 'Бренд Премиум'


# --- Ф2: фильтры выдачи каталога и фасеты ---

def _mk_p(seller, category, name, slug, price=1000, stock=5, brand=None, rating=0):
    """Хелпер: активный товар с опциональным брендом в attributes."""
    attrs = {}
    if brand is not None:
        attrs['brand'] = brand
    p = Product.objects.create(
        seller=seller, category=category, name=name, slug=slug,
        price=price, stock=stock, status='active', attributes=attrs,
    )
    if rating:
        # rating - денормализованная колонка (P6a), не из attributes; ставим прямо.
        Product.objects.filter(id=p.id).update(rating=rating)
    return p


@pytest.mark.django_db
def test_catalog_filter_by_brand_narrows(api_client, seller, category):
    _mk_p(seller, category, 'Nike товар', 'nike-1', brand='Nike')
    _mk_p(seller, category, 'Adidas товар', 'adidas-1', brand='Adidas')

    response = api_client.get('/api/products/?brand=Nike')
    assert response.status_code == 200
    names = [p['name'] for p in response.data['results']]
    assert names == ['Nike товар']


@pytest.mark.django_db
def test_catalog_filter_multi_brand(api_client, seller, category):
    _mk_p(seller, category, 'Nike товар', 'nike-2', brand='Nike')
    _mk_p(seller, category, 'Adidas товар', 'adidas-2', brand='Adidas')
    _mk_p(seller, category, 'Puma товар', 'puma-2', brand='Puma')

    response = api_client.get('/api/products/?brand=Nike&brand=Adidas')
    assert response.status_code == 200
    assert response.data['count'] == 2


@pytest.mark.django_db
def test_catalog_filter_by_price_narrows(api_client, seller, category):
    _mk_p(seller, category, 'Дешёвый', 'cheap', price=500)
    _mk_p(seller, category, 'Средний', 'mid', price=2000)
    _mk_p(seller, category, 'Дорогой', 'pricey', price=9000)

    response = api_client.get('/api/products/?min_price=1000&max_price=3000')
    assert response.status_code == 200
    names = [p['name'] for p in response.data['results']]
    assert names == ['Средний']


@pytest.mark.django_db
def test_catalog_filter_in_stock(api_client, seller, category):
    _mk_p(seller, category, 'В наличии', 'in-stock', stock=5)
    _mk_p(seller, category, 'Нет в наличии', 'out-stock', stock=0)

    response = api_client.get('/api/products/?in_stock=1')
    assert response.status_code == 200
    names = [p['name'] for p in response.data['results']]
    assert names == ['В наличии']


@pytest.mark.django_db
def test_catalog_filter_invalid_price_ignored(api_client, seller, category):
    """Кривая цена (нечисло) не роняет выдачу - игнорируется."""
    _mk_p(seller, category, 'Товар', 'p-junk', price=1000)
    response = api_client.get('/api/products/?min_price=abc&max_price=')
    assert response.status_code == 200
    assert response.data['count'] == 1


@pytest.mark.django_db
def test_catalog_facets_brand_counts(api_client, seller, category):
    _mk_p(seller, category, 'Nike 1', 'n1', brand='Nike')
    _mk_p(seller, category, 'Nike 2', 'n2', brand='Nike')
    _mk_p(seller, category, 'Adidas 1', 'a1', brand='Adidas')

    response = api_client.get(f'/api/products/facets/?category={category.id}')
    assert response.status_code == 200
    brands = {b['value']: b['count'] for b in response.data['brands']}
    assert brands == {'Nike': 2, 'Adidas': 1}
    assert response.data['count'] == 3


@pytest.mark.django_db
def test_catalog_facets_price_buckets(api_client, seller, category):
    _mk_p(seller, category, 'p500', 'b500', price=500)     # 0-1000
    _mk_p(seller, category, 'p2000', 'b2000', price=2000)  # 1000-3000
    _mk_p(seller, category, 'p9000', 'b9000', price=9000)  # 3000-10000

    response = api_client.get(f'/api/products/facets/?category={category.id}')
    assert response.status_code == 200
    buckets = {b['key']: b['count'] for b in response.data['price_ranges']}
    assert buckets['0-1000'] == 1
    assert buckets['1000-3000'] == 1
    assert buckets['3000-10000'] == 1
    assert buckets['10000+'] == 0


@pytest.mark.django_db
def test_catalog_facet_excludes_own_filter(api_client, seller, category):
    """Фасет брендов под выбранным брендом всё равно показывает все бренды
    (per-facet aggregation), иначе мульти-выбор сломается."""
    _mk_p(seller, category, 'Nike', 'fn', brand='Nike')
    _mk_p(seller, category, 'Adidas', 'fa', brand='Adidas')

    response = api_client.get(f'/api/products/facets/?category={category.id}&brand=Nike')
    assert response.status_code == 200
    brand_values = {b['value'] for b in response.data['brands']}
    assert brand_values == {'Nike', 'Adidas'}  # Adidas не пропал
    # но price-фасет уже под фильтром бренда: только Nike-товары
    assert response.data['count'] == 1  # count под применённым brand=Nike


@pytest.mark.django_db
def test_catalog_facets_empty_not_500(api_client, category):
    """Пустая категория без товаров - 200 с нулями, не 500."""
    response = api_client.get(f'/api/products/facets/?category={category.id}')
    assert response.status_code == 200
    assert response.data['count'] == 0
    assert response.data['brands'] == []
    assert response.data['in_stock_count'] == 0


@pytest.mark.django_db
def test_catalog_facets_skip_empty_brand(api_client, seller, category):
    """Товар без бренда не плодит пустую корзину в фасете брендов."""
    _mk_p(seller, category, 'Без бренда', 'no-brand')  # attributes={}
    _mk_p(seller, category, 'С брендом', 'with-brand', brand='Nike')

    response = api_client.get(f'/api/products/facets/?category={category.id}')
    assert response.status_code == 200
    brand_values = [b['value'] for b in response.data['brands']]
    assert brand_values == ['Nike']  # пустой бренд отфильтрован


# --- Ф4: карточка товара (created_at, распределение/сорт/фильтр отзывов) ---

@pytest.fixture
def buyer_of(db, product):
    """Покупатель товара (есть заказ с этим товаром) - может оставить отзыв."""
    from apps.orders.models import Order, OrderItem
    u = User.objects.create_user(username='buyer1', email='b1@t.com',
                                 password='testpass123', role='buyer')
    order = Order.objects.create(buyer=u, total_price=1000, delivery_address='адрес')
    OrderItem.objects.create(order=order, product=product, product_name=product.name,
                             quantity=1, price_at_purchase=product.price)
    return u


@pytest.mark.django_db
def test_review_created_at_set_via_api(api_client, product, buyer_of):
    """Отзыв через API получает created_at (auto_now_add), а не None.
    Это чинит ordering и new Date() на фронте (баг узла 1.5)."""
    api_client.force_authenticate(user=buyer_of)
    response = api_client.post(f'/api/products/{product.id}/reviews/',
                               {'rating': 5, 'text': 'отлично'})
    assert response.status_code == 201
    review = Review.objects.get(product=product, user=buyer_of)
    assert review.created_at is not None


@pytest.mark.django_db
def test_review_post_without_purchase_forbidden(auth_client, product):
    """POST отзыва без покупки -> 403 (серверная проверка, на неё опирается фронт)."""
    response = auth_client.post(f'/api/products/{product.id}/reviews/',
                                {'rating': 5, 'text': 'не покупал'})
    assert response.status_code == 403
    assert Review.objects.filter(product=product).count() == 0


@pytest.mark.django_db
def test_reviews_distribution(api_client, product, seller, category):
    """Ответ отзывов несёт распределение по звёздам (count на 1..5)."""
    u1 = User.objects.create_user(username='r1', email='r1@t.com', password='testpass123', role='buyer')
    u2 = User.objects.create_user(username='r2', email='r2@t.com', password='testpass123', role='buyer')
    u3 = User.objects.create_user(username='r3', email='r3@t.com', password='testpass123', role='buyer')
    Review.objects.create(product=product, user=u1, rating=5, text='супер')
    Review.objects.create(product=product, user=u2, rating=5, text='класс')
    Review.objects.create(product=product, user=u3, rating=3, text='средне')

    response = api_client.get(f'/api/products/{product.id}/reviews/')
    assert response.status_code == 200
    assert response.data['distribution'] == {'1': 0, '2': 0, '3': 1, '4': 0, '5': 2}


@pytest.mark.django_db
def test_reviews_filter_by_rating(api_client, product):
    """?rating=5 оставляет только пятёрки, но распределение остаётся полным."""
    u1 = User.objects.create_user(username='f1', email='f1@t.com', password='testpass123', role='buyer')
    u2 = User.objects.create_user(username='f2', email='f2@t.com', password='testpass123', role='buyer')
    Review.objects.create(product=product, user=u1, rating=5, text='пять')
    Review.objects.create(product=product, user=u2, rating=2, text='два')

    response = api_client.get(f'/api/products/{product.id}/reviews/?rating=5')
    assert response.status_code == 200
    ratings = [r['rating'] for r in response.data['results']]
    assert ratings == [5]
    # гистограмма не схлопывается под фильтром - видна и двойка
    assert response.data['distribution'] == {'1': 0, '2': 1, '3': 0, '4': 0, '5': 1}


@pytest.mark.django_db
def test_reviews_sort_by_rating(api_client, product):
    """?sort=rating_asc сортирует отзывы по оценке по возрастанию."""
    u1 = User.objects.create_user(username='s1', email='s1@t.com', password='testpass123', role='buyer')
    u2 = User.objects.create_user(username='s2', email='s2@t.com', password='testpass123', role='buyer')
    Review.objects.create(product=product, user=u1, rating=5, text='пять')
    Review.objects.create(product=product, user=u2, rating=2, text='два')

    response = api_client.get(f'/api/products/{product.id}/reviews/?sort=rating_asc')
    assert response.status_code == 200
    ratings = [r['rating'] for r in response.data['results']]
    assert ratings == [2, 5]


# --- Ф5: размерная сетка (справочник + эндпоинт + признак сетки в карточке) ---

from apps.products.size_charts import (
    SIZE_CHARTS, CATEGORY_SIZE_GROUP, size_group_for_category, get_size_chart,
)


def test_size_charts_filled_for_every_group():
    """Каждая группа несёт непустые мерки и конвертацию с RU/EU/US."""
    for group, chart in SIZE_CHARTS.items():
        assert chart['measurements'], f'{group}: пустые мерки'
        assert chart['conversion'], f'{group}: пустая конвертация'
        for row in chart['conversion']:
            assert 'ru' in row and 'eu' in row and 'us' in row, f'{group}: неполная конвертация'


def test_size_chart_axes_depend_on_group():
    """Обувь меряется длиной стопы, одежда - обхватами (не хардкод груди для всех)."""
    assert all('foot_cm' in r for r in SIZE_CHARTS['shoes']['measurements'])
    assert all('chest' in r for r in SIZE_CHARTS['top']['measurements'])
    assert all('waist' in r and 'hips' in r for r in SIZE_CHARTS['bottom']['measurements'])


def test_category_group_mapping_covers_all_seed_categories():
    """Маппинг покрывает ровно 20 сид-категорий по точному имени, без «прочее->null»."""
    assert len(CATEGORY_SIZE_GROUP) == 20
    # одежда со своими размерами не упала в null (спорт/костюмы/купальники/комбинезоны)
    assert CATEGORY_SIZE_GROUP['Спортивная одежда'] == 'top'
    assert CATEGORY_SIZE_GROUP['Костюмы'] == 'top'
    assert CATEGORY_SIZE_GROUP['Купальники'] == 'top'
    assert CATEGORY_SIZE_GROUP['Комбинезоны'] == 'dress'
    # категории без сетки честно дают None
    assert CATEGORY_SIZE_GROUP['Носки'] is None
    assert CATEGORY_SIZE_GROUP['Аксессуары'] is None


@pytest.mark.django_db
def test_get_size_chart_resolver(db):
    """Резолвер: категория с группой -> таблица; без группы / None -> None."""
    dresses = Category.objects.create(name='Платья', slug='dresses')
    socks = Category.objects.create(name='Носки', slug='socks')
    chart = get_size_chart(dresses)
    assert chart['group'] == 'dress'
    assert chart['measurements']
    assert get_size_chart(socks) is None
    assert get_size_chart(None) is None
    assert size_group_for_category(None) is None


@pytest.fixture
def dress_product(db, seller):
    cat = Category.objects.create(name='Платья', slug='dresses')
    return Product.objects.create(seller=seller, category=cat, name='Платье',
                                  slug='dress-1', price=3000, stock=5, status='active')


@pytest.fixture
def socks_product(db, seller):
    cat = Category.objects.create(name='Носки', slug='socks')
    return Product.objects.create(seller=seller, category=cat, name='Носки',
                                  slug='socks-1', price=300, stock=50, status='active')


@pytest.mark.django_db
def test_size_chart_endpoint_returns_table(api_client, dress_product):
    """Товар с сеткой -> {group, measurements, conversion}; доступ анонимный."""
    response = api_client.get(f'/api/products/{dress_product.id}/size-chart/')
    assert response.status_code == 200
    assert response.data['group'] == 'dress'
    assert len(response.data['measurements']) > 0
    assert len(response.data['conversion']) > 0


@pytest.mark.django_db
def test_size_chart_endpoint_null_when_no_group(api_client, socks_product):
    """Товар без сетки -> {group: null} (200, не 404) - отличить «нет сетки» от ошибки."""
    response = api_client.get(f'/api/products/{socks_product.id}/size-chart/')
    assert response.status_code == 200
    assert response.data['group'] is None


@pytest.mark.django_db
def test_size_chart_endpoint_404_for_missing_product(api_client):
    """Несуществующий товар -> 404 (не group:null)."""
    response = api_client.get('/api/products/999999/size-chart/')
    assert response.status_code == 404


@pytest.mark.django_db
def test_size_chart_endpoint_cached(api_client, dress_product):
    cache_key = f'size_chart:{dress_product.id}'
    assert cache.get(cache_key) is None
    api_client.get(f'/api/products/{dress_product.id}/size-chart/')
    assert cache.get(cache_key) is not None


@pytest.mark.django_db
def test_product_serializer_exposes_size_group(api_client, dress_product, socks_product):
    """Карточка получает size_group - решает видимость ссылки без отдельного запроса."""
    r1 = api_client.get(f'/api/products/{dress_product.id}/')
    assert r1.data['size_group'] == 'dress'
    r2 = api_client.get(f'/api/products/{socks_product.id}/')
    assert r2.data['size_group'] is None


# --- Ф6: вопросы о товаре (Q&A) ---

@pytest.fixture
def other_user(db):
    return User.objects.create_user(
        username='buyer2', email='buyer2@test.com', password='testpass123', role='buyer'
    )


@pytest.mark.django_db
def test_qa_list_public(api_client, product, user):
    """GET вопросов доступен анониму (AllowAny); ветка с вложенными ответами."""
    from apps.products.models import Question, Answer
    q = Question.objects.create(product=product, user=user, text='Какой материал?')
    Answer.objects.create(question=q, user=user, text='Хлопок 100%')
    response = api_client.get(f'/api/products/{product.id}/questions/')
    assert response.status_code == 200
    results = response.data['results']
    assert len(results) == 1
    assert results[0]['text'] == 'Какой материал?'
    assert results[0]['answers'][0]['text'] == 'Хлопок 100%'


@pytest.mark.django_db
def test_qa_ask_without_purchase(auth_client, product):
    """Вопрос можно задать БЕЗ покупки (ключевое отличие от Review)."""
    response = auth_client.post(
        f'/api/products/{product.id}/questions/', {'text': 'Есть ли скидки?'}
    )
    assert response.status_code == 201


@pytest.mark.django_db
def test_qa_ask_anonymous_401(api_client, product):
    """Анонимная запись вопроса -> 401."""
    response = api_client.post(
        f'/api/products/{product.id}/questions/', {'text': 'Вопрос'}
    )
    assert response.status_code == 401


@pytest.mark.django_db
def test_qa_ask_empty_text_400(auth_client, product):
    """Пустой/пробельный текст вопроса отклоняется."""
    response = auth_client.post(
        f'/api/products/{product.id}/questions/', {'text': '   '}
    )
    assert response.status_code == 400


@pytest.mark.django_db
def test_qa_answer_question(auth_client, product, user):
    from apps.products.models import Question
    q = Question.objects.create(product=product, user=user, text='Размер?')
    response = auth_client.post(
        f'/api/products/{product.id}/questions/{q.id}/answers/', {'text': 'Маломерит'}
    )
    assert response.status_code == 201


@pytest.mark.django_db
def test_qa_answer_wrong_product_404(auth_client, product, category, seller, user):
    """Ответ на вопрос под чужим товаром в URL -> 404."""
    from apps.products.models import Question
    other = Product.objects.create(seller=seller, category=category, name='Другой',
                                   slug='other-p', price=500, stock=5, status='active')
    q = Question.objects.create(product=product, user=user, text='Вопрос')
    response = auth_client.post(
        f'/api/products/{other.id}/questions/{q.id}/answers/', {'text': 'Ответ'}
    )
    assert response.status_code == 404


@pytest.mark.django_db
def test_qa_helpful_toggle(auth_client, product, user):
    """Лайк растит helpful_count; повторный вызов (toggle) снимает; накрутки нет."""
    from apps.products.models import Question, Answer
    q = Question.objects.create(product=product, user=user, text='?')
    a = Answer.objects.create(question=q, user=user, text='Ответ')
    r1 = auth_client.post(f'/api/products/answers/{a.id}/helpful/')
    assert r1.status_code == 200
    assert r1.data['helpful_count'] == 1
    assert r1.data['liked_by_me'] is True
    # toggle - снимаем лайк
    r2 = auth_client.post(f'/api/products/answers/{a.id}/helpful/')
    assert r2.data['helpful_count'] == 0
    assert r2.data['liked_by_me'] is False


@pytest.mark.django_db
def test_qa_helpful_no_double_count(auth_client, product, user):
    """unique_together: один юзер не накрутит счётчик (toggle, а не +1 каждый раз)."""
    from apps.products.models import Question, Answer, AnswerVote
    q = Question.objects.create(product=product, user=user, text='?')
    a = Answer.objects.create(question=q, user=user, text='Ответ')
    auth_client.post(f'/api/products/answers/{a.id}/helpful/')
    a.refresh_from_db()
    assert a.helpful_count == 1
    assert AnswerVote.objects.filter(answer=a).count() == 1


@pytest.mark.django_db
def test_qa_helpful_anonymous_401(api_client, product, user):
    from apps.products.models import Question, Answer
    q = Question.objects.create(product=product, user=user, text='?')
    a = Answer.objects.create(question=q, user=user, text='Ответ')
    response = api_client.post(f'/api/products/answers/{a.id}/helpful/')
    assert response.status_code == 401


@pytest.mark.django_db
def test_qa_answers_sorted_by_helpful(api_client, product, user, other_user):
    """Ответы сортируются по полезности (полезные сверху)."""
    from apps.products.models import Question, Answer, AnswerVote
    q = Question.objects.create(product=product, user=user, text='?')
    low = Answer.objects.create(question=q, user=user, text='Менее полезный')
    high = Answer.objects.create(question=q, user=user, text='Более полезный')
    # high получает лайк -> helpful_count=1 (сигнал пересчитает)
    AnswerVote.objects.create(answer=high, user=user)
    AnswerVote.objects.create(answer=high, user=other_user)
    response = api_client.get(f'/api/products/{product.id}/questions/')
    answers = response.data['results'][0]['answers']
    assert answers[0]['text'] == 'Более полезный'
    assert answers[0]['helpful_count'] == 2
    assert answers[1]['text'] == 'Менее полезный'


@pytest.mark.django_db
def test_qa_is_seller_answer_badge(api_client, product, seller, user):
    """Ответ автора-продавца помечается is_seller_answer (вычисление на сервере)."""
    from apps.products.models import Question, Answer
    q = Question.objects.create(product=product, user=user, text='?')
    Answer.objects.create(question=q, user=seller, text='Ответ продавца')
    Answer.objects.create(question=q, user=user, text='Ответ покупателя')
    response = api_client.get(f'/api/products/{product.id}/questions/')
    answers = response.data['results'][0]['answers']
    by_text = {a['text']: a['is_seller_answer'] for a in answers}
    assert by_text['Ответ продавца'] is True
    assert by_text['Ответ покупателя'] is False


@pytest.mark.django_db
def test_qa_liked_by_me_per_user(auth_client, product, user, other_user):
    """liked_by_me отражает голос ТЕКУЩЕГО юзера; гостю - всегда False."""
    from rest_framework.test import APIClient
    from apps.products.models import Question, Answer, AnswerVote
    q = Question.objects.create(product=product, user=user, text='?')
    a = Answer.objects.create(question=q, user=user, text='Ответ')
    AnswerVote.objects.create(answer=a, user=user)  # лайкнул user (auth_client)
    # auth_client = user -> liked_by_me True
    r_auth = auth_client.get(f'/api/products/{product.id}/questions/')
    assert r_auth.data['results'][0]['answers'][0]['liked_by_me'] is True
    # гость (отдельный неаутентифицированный клиент) -> False
    r_anon = APIClient().get(f'/api/products/{product.id}/questions/')
    assert r_anon.data['results'][0]['answers'][0]['liked_by_me'] is False


@pytest.mark.django_db
def test_qa_missing_product_404(api_client):
    response = api_client.get('/api/products/999999/questions/')
    assert response.status_code == 404


# --- Ф12: форма карточки товара (создание/редактирование, статусы, фото) ---

def _png_bytes():
    """Минимальный валидный PNG (1x1) для проверки загрузки фото."""
    import io
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', (1, 1)).save(buf, format='PNG')
    return buf.getvalue()


@pytest.mark.django_db
def test_f12_create_sizes_aggregate_stock(seller_client, category):
    """stock = сумма остатков по размерам, если размеры заданы (план 4.2);
    sizes получают available=stock>0 (контракт Ф4)."""
    r = seller_client.post('/api/products/create/', {
        'name': 'Куртка зимняя', 'price': 5000, 'category': category.id,
        'status': 'moderation',
        'attributes': {'sizes': [{'label': 'S', 'stock': 3}, {'label': 'M', 'stock': 0}]},
    }, format='json')
    assert r.status_code == 201
    p = Product.objects.get(name='Куртка зимняя')
    assert p.stock == 3  # 3 + 0
    assert p.status == 'moderation'
    sizes = p.attributes['sizes']
    assert sizes[0] == {'label': 'S', 'stock': 3, 'available': True}
    assert sizes[1] == {'label': 'M', 'stock': 0, 'available': False}


@pytest.mark.django_db
def test_f12_default_status_is_draft(seller_client, category):
    """Без явного статуса - draft (дефолт безопасен, не active, план 4.3)."""
    r = seller_client.post('/api/products/create/', {
        'name': 'Без статуса', 'price': 100, 'category': category.id,
    }, format='json')
    assert r.status_code == 201
    assert Product.objects.get(name='Без статуса').status == 'draft'


@pytest.mark.django_db
def test_f12_cannot_create_active(seller_client, category):
    """Создание с status=active отклоняется (обход модерации, план 9)."""
    r = seller_client.post('/api/products/create/', {
        'name': 'Хочу активный', 'price': 100, 'category': category.id, 'status': 'active',
    }, format='json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_f12_slug_autogen_and_collision(seller_client, category):
    """slug генерится на сервере из name; при коллизии - числовой суффикс."""
    r1 = seller_client.post('/api/products/create/', {
        'name': 'Jacket', 'price': 100, 'category': category.id,
    }, format='json')
    r2 = seller_client.post('/api/products/create/', {
        'name': 'Jacket', 'price': 100, 'category': category.id,
    }, format='json')
    assert r1.status_code == 201 and r2.status_code == 201
    slugs = list(Product.objects.filter(name='Jacket').values_list('slug', flat=True))
    assert 'jacket' in slugs and 'jacket-2' in slugs


@pytest.mark.django_db
def test_f12_validation_price_and_old_price(seller_client, category):
    """price>0 обязателен; old_price (если задана) строго больше price."""
    bad_price = seller_client.post('/api/products/create/', {
        'name': 'Бесплатный', 'price': 0, 'category': category.id,
    }, format='json')
    assert bad_price.status_code == 400

    bad_old = seller_client.post('/api/products/create/', {
        'name': 'Кривая скидка', 'price': 1000, 'old_price': 500, 'category': category.id,
    }, format='json')
    assert bad_old.status_code == 400
    assert 'old_price' in bad_old.data


@pytest.mark.django_db
def test_f12_rejects_duplicate_sizes(seller_client, category):
    """Дубликат label размера -> 400, не запись битого JSON (граничный случай)."""
    r = seller_client.post('/api/products/create/', {
        'name': 'Дубль', 'price': 100, 'category': category.id,
        'attributes': {'sizes': [{'label': 'M', 'stock': 1}, {'label': 'M', 'stock': 2}]},
    }, format='json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_f12_rejects_garbage_attributes(seller_client, category):
    """Мусорная структура sizes -> 400, не 500."""
    r = seller_client.post('/api/products/create/', {
        'name': 'Мусор', 'price': 100, 'category': category.id,
        'attributes': {'sizes': 'не список'},
    }, format='json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_f12_edit_keeps_slug_on_name_change(seller_client, seller, category):
    """PATCH с новым name НЕ меняет slug - стабильность ссылок (план 4.5)."""
    p = Product.objects.create(seller=seller, category=category, name='Старое',
                               slug='staroe-fixed', price=100, stock=1, status='draft')
    r = seller_client.patch(f'/api/products/my/{p.id}/', {'name': 'Новое имя'}, format='json')
    assert r.status_code == 200
    p.refresh_from_db()
    assert p.name == 'Новое имя'
    assert p.slug == 'staroe-fixed'


@pytest.mark.django_db
def test_f12_upload_image(seller_client, product, settings, tmp_path):
    """Загрузка фото создаёт ProductImage с инкрементным order."""
    settings.MEDIA_ROOT = str(tmp_path)
    from django.core.files.uploadedfile import SimpleUploadedFile
    img = SimpleUploadedFile('p.png', _png_bytes(), content_type='image/png')
    r = seller_client.post(f'/api/products/my/{product.id}/images/', {'image': img},
                           format='multipart')
    assert r.status_code == 201
    assert product.images.count() == 1
    assert product.images.first().order == 1


@pytest.mark.django_db
def test_f12_upload_rejects_non_image(seller_client, product):
    """Не-изображение -> 400, не 500 и не запись мусора (план 9)."""
    from django.core.files.uploadedfile import SimpleUploadedFile
    bad = SimpleUploadedFile('p.txt', b'not an image', content_type='text/plain')
    r = seller_client.post(f'/api/products/my/{product.id}/images/', {'image': bad},
                           format='multipart')
    assert r.status_code == 400
    assert product.images.count() == 0


@pytest.mark.django_db
def test_f12_cannot_upload_to_foreign_product(api_client, product, settings, tmp_path):
    """Чужой товар недоступен для загрузки фото (404, владение, план 9)."""
    settings.MEDIA_ROOT = str(tmp_path)
    other = User.objects.create_user(username='seller2', email='s2@test.com',
                                     password='testpass123', role='seller')
    api_client.force_authenticate(user=other)
    from django.core.files.uploadedfile import SimpleUploadedFile
    img = SimpleUploadedFile('p.png', _png_bytes(), content_type='image/png')
    r = api_client.post(f'/api/products/my/{product.id}/images/', {'image': img},
                        format='multipart')
    assert r.status_code == 404
    assert product.images.count() == 0


@pytest.mark.django_db
def test_f12_reorder_images(seller_client, product):
    """PUT порядок -> order проставляется по позиции в списке (план Этап 3)."""
    from apps.products.models import ProductImage
    a = ProductImage.objects.create(product=product, image_url='http://x/a.png', order=1)
    b = ProductImage.objects.create(product=product, image_url='http://x/b.png', order=2)
    r = seller_client.put(f'/api/products/my/{product.id}/images/',
                          {'order': [b.id, a.id]}, format='json')
    assert r.status_code == 200
    a.refresh_from_db(); b.refresh_from_db()
    assert b.order == 0 and a.order == 1  # b теперь первым (обложка)


@pytest.mark.django_db
def test_f12_delete_own_image(seller_client, seller, product, settings, tmp_path):
    """Удаление своего фото работает; чужое - 404."""
    settings.MEDIA_ROOT = str(tmp_path)
    from apps.products.models import ProductImage
    img = ProductImage.objects.create(product=product, image_url='http://x/y.png', order=1)
    r = seller_client.delete(f'/api/products/my/{product.id}/images/{img.id}/')
    assert r.status_code == 204
    assert product.images.count() == 0


@pytest.mark.django_db
def test_qa_helpful_missing_answer_404(auth_client):
    response = auth_client.post('/api/products/answers/999999/helpful/')
    assert response.status_code == 404


# --- Ф13: реестр товаров продавца (фильтр по статусу, counts, видимость) ---

@pytest.fixture
def seller_products(db, seller, category):
    """По одному товару в каждом из четырёх статусов одного продавца."""
    def mk(name, slug, status):
        return Product.objects.create(
            seller=seller, category=category, name=name, slug=slug,
            price=1000, stock=5, status=status,
        )
    return {
        'active': mk('Активный', 'f13-active', 'active'),
        'hidden': mk('Скрытый', 'f13-hidden', 'hidden'),
        'moderation': mk('На модерации', 'f13-moderation', 'moderation'),
        'draft': mk('Черновик', 'f13-draft', 'draft'),
    }


@pytest.mark.django_db
def test_f13_list_filter_by_status(seller_client, seller_products):
    """?status=active отдаёт только активные товары продавца."""
    r = seller_client.get('/api/products/my/?status=active')
    assert r.status_code == 200
    names = [p['name'] for p in r.data['results']]
    assert names == ['Активный']


@pytest.mark.django_db
def test_f13_list_all_without_status(seller_client, seller_products):
    """Без параметра status - все статусы продавца."""
    r = seller_client.get('/api/products/my/')
    statuses = {p['status'] for p in r.data['results']}
    assert statuses == {'active', 'hidden', 'moderation', 'draft'}


@pytest.mark.django_db
def test_f13_list_counts_in_every_response(seller_client, seller_products):
    """counts по статусам присутствуют и при фильтре (не застывают)."""
    r = seller_client.get('/api/products/my/?status=active')
    counts = r.data['counts']
    assert counts['all'] == 4
    assert counts['active'] == 1
    assert counts['hidden'] == 1
    assert counts['moderation'] == 1
    assert counts['draft'] == 1
    assert counts['rejected'] == 0  # статус заведён, товаров нет (пуст до Ф17)


@pytest.mark.django_db
def test_f13_list_and_counts_only_own(seller_client, seller_products, category):
    """Чужие товары не видны в списке и не считаются в counts (владение)."""
    other = User.objects.create_user(username='s_other', email='so@t.com',
                                     password='testpass123', role='seller')
    Product.objects.create(seller=other, category=category, name='Чужой',
                           slug='f13-foreign', price=100, stock=1, status='active')
    r = seller_client.get('/api/products/my/')
    assert r.data['counts']['all'] == 4
    assert 'Чужой' not in [p['name'] for p in r.data['results']]


@pytest.mark.django_db
def test_f13_visibility_hide_active(seller_client, seller_products):
    """active -> hidden через visibility-эндпоинт."""
    p = seller_products['active']
    r = seller_client.post(f'/api/products/my/{p.id}/visibility/')
    assert r.status_code == 200
    assert r.data['status'] == 'hidden'
    p.refresh_from_db()
    assert p.status == 'hidden'


@pytest.mark.django_db
def test_f13_visibility_show_hidden(seller_client, seller_products):
    """hidden -> active через visibility-эндпоинт."""
    p = seller_products['hidden']
    r = seller_client.post(f'/api/products/my/{p.id}/visibility/')
    assert r.status_code == 200
    assert r.data['status'] == 'active'
    p.refresh_from_db()
    assert p.status == 'active'


@pytest.mark.django_db
@pytest.mark.parametrize('status', ['moderation', 'rejected', 'draft'])
def test_f13_visibility_forbidden_from_non_vitrine(seller_client, seller, category, status):
    """Скрыть/показать товар вне витрины (moderation/rejected/draft) -> 400,
    статус не меняется (нельзя обойти модерацию, план 5.2/10)."""
    p = Product.objects.create(seller=seller, category=category, name='X',
                               slug=f'f13-vis-{status}', price=100, stock=1, status=status)
    r = seller_client.post(f'/api/products/my/{p.id}/visibility/')
    assert r.status_code == 400
    p.refresh_from_db()
    assert p.status == status


@pytest.mark.django_db
def test_f13_visibility_foreign_product_404(seller_client, category):
    """Видимость чужого товара -> 404 (владение по queryset)."""
    other = User.objects.create_user(username='s_other2', email='so2@t.com',
                                     password='testpass123', role='seller')
    p = Product.objects.create(seller=other, category=category, name='Чужой',
                               slug='f13-foreign-vis', price=100, stock=1, status='active')
    r = seller_client.post(f'/api/products/my/{p.id}/visibility/')
    assert r.status_code == 404
    p.refresh_from_db()
    assert p.status == 'active'


@pytest.mark.django_db
def test_f13_visibility_requires_seller_role(auth_client, seller, category):
    """Покупатель (роль buyer) не имеет доступа к seller-эндпоинту -> 403."""
    p = Product.objects.create(seller=seller, category=category, name='X',
                               slug='f13-vis-buyer', price=100, stock=1, status='active')
    r = auth_client.post(f'/api/products/my/{p.id}/visibility/')
    assert r.status_code == 403


@pytest.mark.django_db
def test_f13_delete_own_product(seller_client, seller_products, monkeypatch):
    """Удаление своего товара работает (ES-чистка замокана - не зависим от ES)."""
    monkeypatch.setattr('apps.products.views.delete_product', lambda pid: None)
    p = seller_products['active']
    r = seller_client.delete(f'/api/products/my/{p.id}/')
    assert r.status_code == 204
    assert not Product.objects.filter(id=p.id).exists()


# === Ф15. Ответы продавца на отзывы и вопросы (узел 2.8) ===

@pytest.fixture
def review(db, product):
    """Отзыв покупателя на товар продавца (для ответов Ф15)."""
    buyer = User.objects.create_user(username='f15buyer', email='f15b@t.com',
                                     password='testpass123', role='buyer')
    return Review.objects.create(product=product, user=buyer, rating=4, text='норм')


@pytest.mark.django_db
def test_f15_public_review_exposes_reply_fields(api_client, product, review):
    """Публичный эндпоинт отзывов отдаёт seller_reply/at (для блока на карточке)."""
    review.seller_reply = 'Спасибо за отзыв!'
    from django.utils import timezone
    review.seller_reply_at = timezone.now()
    review.save()
    r = api_client.get(f'/api/products/{product.id}/reviews/')
    assert r.status_code == 200
    row = r.data['results'][0]
    assert row['seller_reply'] == 'Спасибо за отзыв!'
    assert row['seller_reply_at'] is not None


@pytest.mark.django_db
def test_f15_owner_can_reply(seller_client, review):
    """Владелец товара отвечает на отзыв -> 200, ответ и дата сохранены."""
    r = seller_client.post(f'/api/products/reviews/{review.id}/reply/', {'text': 'Рады!'})
    assert r.status_code == 200
    review.refresh_from_db()
    assert review.seller_reply == 'Рады!'
    assert review.seller_reply_at is not None


@pytest.mark.django_db
def test_f15_reply_overwrites_no_dup(seller_client, review):
    """Повторный POST перезаписывает ответ (1:1 поле, не плодит дубль)."""
    seller_client.post(f'/api/products/reviews/{review.id}/reply/', {'text': 'Первый'})
    seller_client.post(f'/api/products/reviews/{review.id}/reply/', {'text': 'Второй'})
    review.refresh_from_db()
    assert review.seller_reply == 'Второй'


@pytest.mark.django_db
def test_f15_foreign_seller_reply_forbidden(api_client, review, category):
    """Чужой продавец (не владелец товара) -> 403, ответ не сохранён (анти-подмена)."""
    other = User.objects.create_user(username='f15other', email='f15o@t.com',
                                     password='testpass123', role='seller')
    api_client.force_authenticate(user=other)
    r = api_client.post(f'/api/products/reviews/{review.id}/reply/', {'text': 'чужой'})
    assert r.status_code == 403
    review.refresh_from_db()
    assert review.seller_reply == ''


@pytest.mark.django_db
def test_f15_buyer_reply_forbidden(auth_client, review):
    """Покупатель не может ответить от лица магазина -> 403."""
    r = auth_client.post(f'/api/products/reviews/{review.id}/reply/', {'text': 'я покупатель'})
    assert r.status_code == 403


@pytest.mark.django_db
def test_f15_anon_reply_unauthorized(api_client, review):
    """Аноним -> 401."""
    r = api_client.post(f'/api/products/reviews/{review.id}/reply/', {'text': 'аноним'})
    assert r.status_code == 401


@pytest.mark.django_db
def test_f15_reply_missing_review_404(seller_client):
    """Несуществующий отзыв -> 404."""
    r = seller_client.post('/api/products/reviews/999999/reply/', {'text': 'нет'})
    assert r.status_code == 404


@pytest.mark.django_db
def test_f15_reply_empty_text_400(seller_client, review):
    """Пустой/пробельный текст -> 400, ответ не публикуется."""
    r = seller_client.post(f'/api/products/reviews/{review.id}/reply/', {'text': '   '})
    assert r.status_code == 400
    review.refresh_from_db()
    assert review.seller_reply == ''


@pytest.mark.django_db
def test_f15_reply_too_long_400(seller_client, review):
    """Ответ длиннее лимита 2000 символов -> 400."""
    r = seller_client.post(f'/api/products/reviews/{review.id}/reply/', {'text': 'я' * 2001})
    assert r.status_code == 400


@pytest.mark.django_db
def test_f15_seller_reviews_list_own_only(seller_client, product, review, category):
    """GET /my/reviews/ отдаёт отзывы по своим товарам с product-контекстом и
    не показывает отзывы на чужие товары (изоляция продавцов, часть 9)."""
    other = User.objects.create_user(username='f15s2', email='f15s2@t.com',
                                     password='testpass123', role='seller')
    other_product = Product.objects.create(seller=other, category=category, name='Чужой',
                                           slug='f15-foreign', price=100, stock=1, status='active')
    foreign_buyer = User.objects.create_user(username='f15fb', email='f15fb@t.com',
                                             password='testpass123', role='buyer')
    Review.objects.create(product=other_product, user=foreign_buyer, rating=1, text='чужой отзыв')

    r = seller_client.get('/api/products/my/reviews/')
    assert r.status_code == 200
    rows = r.data['results']
    assert len(rows) == 1
    assert rows[0]['id'] == review.id
    assert rows[0]['product_id'] == product.id
    assert rows[0]['product_name'] == product.name


@pytest.mark.django_db
def test_f15_seller_reviews_answered_filter_and_sort(seller_client, product, category):
    """?answered=false оставляет отзывы без ответа; без фильтра неотвеченные сверху."""
    b1 = User.objects.create_user(username='f15a', email='f15a@t.com', password='testpass123', role='buyer')
    b2 = User.objects.create_user(username='f15b2', email='f15b2@t.com', password='testpass123', role='buyer')
    answered = Review.objects.create(product=product, user=b1, rating=5, text='отвечен',
                                     seller_reply='спасибо')
    unanswered = Review.objects.create(product=product, user=b2, rating=2, text='без ответа')

    r = seller_client.get('/api/products/my/reviews/?answered=false')
    ids = [x['id'] for x in r.data['results']]
    assert ids == [unanswered.id]

    r2 = seller_client.get('/api/products/my/reviews/?answered=true')
    ids2 = [x['id'] for x in r2.data['results']]
    assert ids2 == [answered.id]

    r3 = seller_client.get('/api/products/my/reviews/')
    ids3 = [x['id'] for x in r3.data['results']]
    assert ids3[0] == unanswered.id  # без ответа сверху


@pytest.mark.django_db
def test_f15_seller_reviews_requires_seller_role(auth_client):
    """Покупатель -> 403 на seller-эндпоинте отзывов."""
    assert auth_client.get('/api/products/my/reviews/').status_code == 403


@pytest.mark.django_db
def test_f15_seller_reviews_anon_unauthorized(api_client):
    """Аноним -> 401."""
    assert api_client.get('/api/products/my/reviews/').status_code == 401


@pytest.mark.django_db
def test_f15_seller_questions_list_own_only_with_badge(seller_client, product, seller, category):
    """GET /my/questions/ отдаёт вопросы по своим товарам с ответами и бейджем
    is_seller_answer; чужие вопросы не видны."""
    from apps.products.models import Question, Answer
    asker = User.objects.create_user(username='f15q', email='f15q@t.com', password='testpass123', role='buyer')
    q = Question.objects.create(product=product, user=asker, text='есть размер L?')
    Answer.objects.create(question=q, user=seller, text='да, есть')  # ответ продавца

    # Чужой товар с вопросом - не должен попасть.
    other = User.objects.create_user(username='f15qs', email='f15qs@t.com', password='testpass123', role='seller')
    op = Product.objects.create(seller=other, category=category, name='Чужой Q',
                                slug='f15-foreign-q', price=100, stock=1, status='active')
    Question.objects.create(product=op, user=asker, text='чужой вопрос')

    r = seller_client.get('/api/products/my/questions/')
    assert r.status_code == 200
    rows = r.data['results']
    assert len(rows) == 1
    assert rows[0]['product_id'] == product.id
    assert rows[0]['answers'][0]['is_seller_answer'] is True


@pytest.mark.django_db
def test_f15_seller_questions_answered_filter(seller_client, product, seller):
    """?answered=false оставляет только вопросы без ответа продавца."""
    from apps.products.models import Question, Answer
    asker = User.objects.create_user(username='f15q2', email='f15q2@t.com', password='testpass123', role='buyer')
    answered = Question.objects.create(product=product, user=asker, text='с ответом продавца')
    Answer.objects.create(question=answered, user=seller, text='ответ продавца')
    unanswered = Question.objects.create(product=product, user=asker, text='без ответа продавца')
    # Ответ НЕ продавца (другого покупателя) не считается ответом продавца.
    Answer.objects.create(question=unanswered, user=asker, text='ответ покупателя')

    r = seller_client.get('/api/products/my/questions/?answered=false')
    ids = [x['id'] for x in r.data['results']]
    assert ids == [unanswered.id]


@pytest.mark.django_db
def test_f15_seller_questions_requires_seller_role(auth_client):
    """Покупатель -> 403 на seller-эндпоинте вопросов."""
    assert auth_client.get('/api/products/my/questions/').status_code == 403


# ============================================================================
# Ф16 - Дашборд продавца (узел 2.1): денежная сводка + график + панель действий
# ============================================================================

from datetime import timedelta
from django.utils import timezone


def _mk_order(buyer, status='paid', created_days_ago=0, items=None):
    """Заказ с позициями. created_at - auto_now_add, поэтому при необходимости
    сдвигаем дату отдельным update (иначе не выставить прошлое)."""
    from apps.orders.models import Order, OrderItem
    order = Order.objects.create(buyer=buyer, total_price=0, delivery_address='адрес', status=status)
    for product, qty, price in (items or []):
        OrderItem.objects.create(
            order=order, product=product, product_name=product.name,
            quantity=qty, price_at_purchase=price,
        )
    if created_days_ago:
        new_dt = timezone.now() - timedelta(days=created_days_ago)
        Order.objects.filter(pk=order.pk).update(created_at=new_dt)
    return order


@pytest.fixture
def f16_buyer(db):
    return User.objects.create_user(username='f16buyer', email='f16b@t.com',
                                    password='testpass123', role='buyer')


@pytest.fixture
def f16_product(db, seller, category):
    return Product.objects.create(seller=seller, category=category, name='Худи',
                                  slug='f16-hoodie', price=1000, stock=10, status='active')


@pytest.mark.django_db
def test_f16_requires_seller_role(auth_client):
    """Покупатель/гость не имеют доступа к дашборду."""
    assert auth_client.get('/api/products/dashboard/').status_code == 403


@pytest.mark.django_db
def test_f16_summary_counts_seller_revenue(seller_client, f16_product, f16_buyer):
    """Выручка/заказы/средний чек/штуки считаются по позициям продавца."""
    _mk_order(f16_buyer, status='paid', items=[(f16_product, 2, 1000)])
    res = seller_client.get('/api/products/dashboard/?period=30d')
    assert res.status_code == 200
    s = res.data['summary']
    assert s['revenue'] == '2000.00'
    assert s['orders'] == 1
    assert s['avg_check'] == '2000.00'
    assert s['units'] == 2
    # И график в том же ответе считает ту же выручку (свежее выражение на запрос).
    assert sum(float(c['revenue']) for c in res.data['chart']) == 2000.0


@pytest.mark.django_db
def test_f16_cancelled_order_excluded(seller_client, f16_product, f16_buyer):
    """Отменённый заказ не входит в выручку (легко завысить - тест обязателен)."""
    _mk_order(f16_buyer, status='cancelled', items=[(f16_product, 5, 1000)])
    res = seller_client.get('/api/products/dashboard/?period=30d')
    assert res.data['summary']['revenue'] == '0.00'
    assert res.data['summary']['orders'] == 0


@pytest.mark.django_db
def test_f16_foreign_seller_isolation(seller_client, f16_product, f16_buyer, category):
    """Заказ на товар другого продавца не попадает в сводку (изоляция, часть 9)."""
    other = User.objects.create_user(username='other_s', email='os@t.com',
                                     password='x', role='seller')
    other_product = Product.objects.create(seller=other, category=category, name='Чужое',
                                           slug='f16-foreign', price=500, stock=5, status='active')
    _mk_order(f16_buyer, status='paid', items=[(other_product, 3, 500)])
    res = seller_client.get('/api/products/dashboard/?period=30d')
    assert res.data['summary']['revenue'] == '0.00'


@pytest.mark.django_db
def test_f16_mixed_order_only_seller_items(seller_client, f16_product, f16_buyer, category):
    """Смешанный заказ: считаем только позиции продавца, не Order.total_price (утечка)."""
    other = User.objects.create_user(username='other_s2', email='os2@t.com',
                                     password='x', role='seller')
    other_product = Product.objects.create(seller=other, category=category, name='Чужое2',
                                           slug='f16-foreign2', price=9999, stock=5, status='active')
    order = _mk_order(f16_buyer, status='paid',
                      items=[(f16_product, 1, 1000), (other_product, 1, 9999)])
    # total_price заказа большой, но продавцу засчитываются только его 1000.
    order.total_price = 10999
    order.save(update_fields=['total_price'])
    res = seller_client.get('/api/products/dashboard/?period=30d')
    assert res.data['summary']['revenue'] == '1000.00'
    assert res.data['summary']['units'] == 1


@pytest.mark.django_db
def test_f16_avg_check_zero_orders(seller_client, f16_product):
    """orders==0 -> avg_check '0.00' (без деления на ноль)."""
    res = seller_client.get('/api/products/dashboard/?period=30d')
    assert res.data['summary']['avg_check'] == '0.00'
    assert res.data['summary']['orders'] == 0


@pytest.mark.django_db
def test_f16_period_slices_by_date(seller_client, f16_product, f16_buyer):
    """Старый заказ (40 дней назад) виден в 'all', но не в '30d'."""
    _mk_order(f16_buyer, status='paid', created_days_ago=40, items=[(f16_product, 1, 1000)])
    res_30 = seller_client.get('/api/products/dashboard/?period=30d')
    res_all = seller_client.get('/api/products/dashboard/?period=all')
    assert res_30.data['summary']['revenue'] == '0.00'
    assert res_all.data['summary']['revenue'] == '1000.00'


@pytest.mark.django_db
def test_f16_garbage_period_falls_back(seller_client, f16_product):
    """Мусорный period -> фолбэк на 30d, не 500."""
    res = seller_client.get('/api/products/dashboard/?period=zzz')
    assert res.status_code == 200
    assert res.data['period'] == '30d'


@pytest.mark.django_db
def test_f16_chart_fills_zero_days(seller_client, f16_product):
    """Ряд за 7d содержит ровно 7 точек, даже если продаж не было (дни-нули, 4.3)."""
    res = seller_client.get('/api/products/dashboard/?period=7d')
    chart = res.data['chart']
    assert len(chart) == 7
    assert all(c['revenue'] == '0.00' and c['orders'] == 0 for c in chart)


@pytest.mark.django_db
def test_f16_action_items_low_stock_and_orders(seller_client, f16_product, f16_buyer, category):
    """low_stock ловит товар с малым остатком; new_orders считает created/paid."""
    Product.objects.create(seller=f16_product.seller, category=category, name='Кончается',
                           slug='f16-low', price=100, stock=2, status='active')
    _mk_order(f16_buyer, status='created', items=[(f16_product, 1, 1000)])
    res = seller_client.get('/api/products/dashboard/?period=30d')
    ai = res.data['action_items']
    assert ai['new_orders'] == 1
    low_names = [p['name'] for p in ai['low_stock']]
    assert 'Кончается' in low_names
    # out_of_stock=0 для stock=2 (заканчивается, но не закончился).
    assert all(p['out_of_stock'] is False for p in ai['low_stock'] if p['name'] == 'Кончается')


@pytest.mark.django_db
def test_f16_recent_review_counted(seller_client, f16_product, f16_buyer):
    """Свежий отзыв на товар продавца попадает в recent_reviews."""
    Review.objects.create(product=f16_product, user=f16_buyer, rating=5, text='Отлично')
    res = seller_client.get('/api/products/dashboard/?period=30d')
    assert res.data['action_items']['recent_reviews'] == 1


@pytest.mark.django_db
def test_f16_graceful_without_clickhouse(seller_client, f16_product, f16_buyer):
    """Деньги считаются из Postgres даже если ClickHouse пуст/недоступен."""
    _mk_order(f16_buyer, status='paid', items=[(f16_product, 1, 1000)])
    res = seller_client.get('/api/products/dashboard/?period=30d')
    assert res.data['summary']['revenue'] == '1000.00'
    assert 'engagement' in res.data
    assert res.data['engagement']['views'] >= 0


# --- Ф17: модерация товаров (очередь, одобрить/отклонить с причиной, права) ---

@pytest.fixture
def pending_product(db, seller, category):
    """Товар на модерации - элемент очереди Ф17."""
    return Product.objects.create(
        seller=seller, category=category, name='Куртка на модерации',
        slug='f17-pending', price=5000, stock=5, status='moderation',
        attributes={'brand': 'LocalBrand', 'sizes': [{'label': 'M', 'stock': 5, 'available': True}]},
    )


@pytest.fixture(autouse=True)
def _mute_es_in_moderation(monkeypatch):
    """По умолчанию глушим реальный ES в сервисе модерации: переход не должен
    зависеть от ES в большинстве тестов. Тесты, проверяющие вызов ES, ставят
    свой recorder поверх этого."""
    monkeypatch.setattr('apps.products.moderation.index_product', lambda p: None)
    monkeypatch.setattr('apps.products.moderation.delete_product', lambda pid: None)


@pytest.mark.django_db
def test_f17_queue_lists_moderation_only(admin_client, pending_product, product):
    """Очередь отдаёт только товары moderation; active (product) в неё не попадает."""
    res = admin_client.get('/api/products/moderation/')
    assert res.status_code == 200
    ids = [p['id'] for p in res.data['results']]
    assert pending_product.id in ids
    assert product.id not in ids


@pytest.mark.django_db
def test_f17_queue_no_email_leak(admin_client, pending_product, seller):
    """S17: строка очереди отдаёт seller_name (имя/магазин), не email продавца."""
    res = admin_client.get('/api/products/moderation/')
    row = res.data['results'][0]
    assert row['seller_name'] != seller.email
    assert '@' not in row['seller_name']


def _client_as(user=None):
    """Свежий APIClient под конкретной ролью. Нужен, когда в одном тесте
    участвует несколько ролей: фикстуры *_client делят один экземпляр api_client,
    и их аутентификация затирает друг друга (см. test_qa_liked_by_me_per_user)."""
    from rest_framework.test import APIClient
    c = APIClient()
    if user is not None:
        c.force_authenticate(user=user)
    return c


@pytest.mark.django_db
@pytest.mark.parametrize('endpoint', ['approve', 'reject'])
def test_f17_actions_require_admin(seller, user, pending_product, endpoint):
    """Продавец/покупатель -> 403, аноним -> 401. Барьер модерации (§9)."""
    url = f'/api/products/moderation/{pending_product.id}/{endpoint}/'
    body = {'reason': 'нельзя'} if endpoint == 'reject' else {}
    assert _client_as(seller).post(url, body, format='json').status_code == 403
    assert _client_as(user).post(url, body, format='json').status_code == 403
    assert _client_as().post(url, body, format='json').status_code == 401


@pytest.mark.django_db
def test_f17_queue_requires_admin(seller, user):
    """Очередь модерации видна только админу."""
    assert _client_as(seller).get('/api/products/moderation/').status_code == 403
    assert _client_as(user).get('/api/products/moderation/').status_code == 403
    assert _client_as().get('/api/products/moderation/').status_code == 401


@pytest.mark.django_db
def test_f17_approve_publishes_to_catalog(admin_client, api_client, pending_product, admin, monkeypatch):
    """approve: moderation -> active, товар появляется в каталоге, индексируется в ES,
    проставлен аудит, причина пуста."""
    indexed = []
    monkeypatch.setattr('apps.products.moderation.index_product', lambda p: indexed.append(p.id))

    res = admin_client.post(f'/api/products/moderation/{pending_product.id}/approve/')
    assert res.status_code == 200
    assert res.data['status'] == 'active'

    pending_product.refresh_from_db()
    assert pending_product.status == 'active'
    assert pending_product.rejection_reason == ''
    assert pending_product.moderated_by_id == admin.id
    assert pending_product.moderated_at is not None
    assert indexed == [pending_product.id]  # переиндексация в ES вызвана

    # Появился в каталоге (фильтр status='active').
    catalog = api_client.get('/api/products/')
    assert pending_product.id in [p['id'] for p in catalog.data['results']]


@pytest.mark.django_db
def test_f17_reject_with_reason(admin_client, api_client, pending_product, admin, monkeypatch):
    """reject: moderation -> rejected, причина записана, товар убран из ES и каталога."""
    deleted = []
    monkeypatch.setattr('apps.products.moderation.delete_product', lambda pid: deleted.append(pid))

    res = admin_client.post(f'/api/products/moderation/{pending_product.id}/reject/',
                            {'reason': 'Плохие фото, переснимите'}, format='json')
    assert res.status_code == 200
    assert res.data['status'] == 'rejected'

    pending_product.refresh_from_db()
    assert pending_product.status == 'rejected'
    assert pending_product.rejection_reason == 'Плохие фото, переснимите'
    assert pending_product.moderated_by_id == admin.id
    assert deleted == [pending_product.id]  # удалён из ES-поиска

    # Не в каталоге.
    catalog = api_client.get('/api/products/')
    assert pending_product.id not in [p['id'] for p in catalog.data['results']]


@pytest.mark.django_db
@pytest.mark.parametrize('reason', ['', '   ', None])
def test_f17_reject_without_reason_400(admin_client, pending_product, reason):
    """Отклонение без непустой причины -> 400 (причина обязательна, узел 3.2)."""
    body = {} if reason is None else {'reason': reason}
    res = admin_client.post(f'/api/products/moderation/{pending_product.id}/reject/',
                            body, format='json')
    assert res.status_code == 400
    pending_product.refresh_from_db()
    assert pending_product.status == 'moderation'  # статус не изменился


@pytest.mark.django_db
def test_f17_reject_too_long_reason_400(admin_client, pending_product):
    """Слишком длинная причина -> 400, не запись портянки."""
    res = admin_client.post(f'/api/products/moderation/{pending_product.id}/reject/',
                            {'reason': 'я' * 1001}, format='json')
    assert res.status_code == 400


@pytest.mark.django_db
def test_f17_double_approve_409(admin_client, pending_product):
    """Повторное действие над уже промодерированным товаром -> 409 (гонка/двойной клик)."""
    r1 = admin_client.post(f'/api/products/moderation/{pending_product.id}/approve/')
    assert r1.status_code == 200
    r2 = admin_client.post(f'/api/products/moderation/{pending_product.id}/approve/')
    assert r2.status_code == 409


@pytest.mark.django_db
def test_f17_reject_after_approve_409(admin_client, pending_product):
    """Отклонить уже одобренный -> 409, причина не перезаписывается."""
    admin_client.post(f'/api/products/moderation/{pending_product.id}/approve/')
    r = admin_client.post(f'/api/products/moderation/{pending_product.id}/reject/',
                          {'reason': 'поздно'}, format='json')
    assert r.status_code == 409
    pending_product.refresh_from_db()
    assert pending_product.status == 'active'
    assert pending_product.rejection_reason == ''


@pytest.mark.django_db
def test_f17_action_missing_id_404(admin_client):
    """Действие над несуществующим id -> 404, не 500."""
    assert admin_client.post('/api/products/moderation/999999/approve/').status_code == 404
    assert admin_client.post('/api/products/moderation/999999/reject/',
                             {'reason': 'x'}, format='json').status_code == 404


@pytest.mark.django_db
def test_f17_approve_invalidates_card_cache(admin_client, api_client, pending_product):
    """Кэш карточки сбрасывается при переходе (сигнал product_changed на .save())."""
    # Прогреть кэш карточки нельзя (товар не active), поэтому проверяем инвалидацию
    # после одобрения: ставим маркер, approve -> .save() -> сигнал чистит ключ.
    cache_key = f'product_detail:{pending_product.id}'
    cache.set(cache_key, {'stale': True}, 300)
    admin_client.post(f'/api/products/moderation/{pending_product.id}/approve/')
    assert cache.get(cache_key) is None


@pytest.mark.django_db
def test_f17_resubmit_clears_rejection_reason(seller_client, seller, category):
    """Переотправка отклонённого товара на модерацию очищает прошлую причину (§6)."""
    rejected = Product.objects.create(
        seller=seller, category=category, name='Отклонённый', slug='f17-rej',
        price=1000, stock=3, status='rejected', rejection_reason='Старая причина',
    )
    res = seller_client.patch(f'/api/products/my/{rejected.id}/',
                              {'status': 'moderation'}, format='json')
    assert res.status_code == 200
    rejected.refresh_from_db()
    assert rejected.status == 'moderation'
    assert rejected.rejection_reason == ''  # причина не залипла


@pytest.mark.django_db
def test_f17_rejection_reason_visible_to_seller(admin, seller, pending_product):
    """Продавец видит причину отклонения в своём реестре (Ф13), как требует узел 3.2."""
    _client_as(admin).post(f'/api/products/moderation/{pending_product.id}/reject/',
                           {'reason': 'Нет состава ткани'}, format='json')
    res = _client_as(seller).get('/api/products/my/?status=rejected')
    row = [p for p in res.data['results'] if p['id'] == pending_product.id][0]
    assert row['rejection_reason'] == 'Нет состава ткани'


# --- Ф17: admin-actions Django (Вариант B, фоллбэк через тот же сервис) ---

def _admin_request(admin, post_data=None):
    """Запрос с messages-storage для вызова admin-action напрямую."""
    from django.test import RequestFactory
    from django.contrib.messages.storage.fallback import FallbackStorage
    rf = RequestFactory()
    req = rf.post('/admin/', post_data or {})
    req.user = admin
    setattr(req, 'session', {})
    setattr(req, '_messages', FallbackStorage(req))
    return req


@pytest.mark.django_db
def test_f17_admin_action_approve(admin, pending_product):
    """Bulk-action «Одобрить» зовёт сервис: товар становится active с аудитом."""
    from django.contrib.admin.sites import AdminSite
    from apps.products.admin import ProductAdmin, approve_moderation
    ma = ProductAdmin(Product, AdminSite())
    approve_moderation(ma, _admin_request(admin), Product.objects.filter(id=pending_product.id))
    pending_product.refresh_from_db()
    assert pending_product.status == 'active'
    assert pending_product.moderated_by_id == admin.id


@pytest.mark.django_db
def test_f17_admin_action_reject_with_reason(admin, pending_product):
    """Action «Отклонить с причиной» (фаза apply) пишет причину через сервис."""
    from django.contrib.admin.sites import AdminSite
    from apps.products.admin import ProductAdmin, reject_moderation
    ma = ProductAdmin(Product, AdminSite())
    req = _admin_request(admin, {'apply': '1', 'reason': 'Запрещённый бренд'})
    reject_moderation(ma, req, Product.objects.filter(id=pending_product.id))
    pending_product.refresh_from_db()
    assert pending_product.status == 'rejected'
    assert pending_product.rejection_reason == 'Запрещённый бренд'


@pytest.mark.django_db
def test_f17_admin_action_reject_empty_reason_keeps_status(admin, pending_product):
    """Пустая причина в admin-action не отклоняет товар (причина обязательна)."""
    from django.contrib.admin.sites import AdminSite
    from apps.products.admin import ProductAdmin, reject_moderation
    ma = ProductAdmin(Product, AdminSite())
    req = _admin_request(admin, {'apply': '1', 'reason': '   '})
    reject_moderation(ma, req, Product.objects.filter(id=pending_product.id))
    pending_product.refresh_from_db()
    assert pending_product.status == 'moderation'


# --- Ф18: жалобы и модерация UGC (узел 3.8 + «пожаловаться» из 1.5) ---

@pytest.fixture
def buyer_review(db, user, product):
    """Отзыв покупателя на товар (цель жалобы/скрытия). Создание через ORM
    триггерит сигнал recalc_product_rating - product.rating обновится."""
    return Review.objects.create(product=product, user=user, rating=5, text='Отличный товар')


@pytest.fixture
def product_question(db, user, product):
    return Question.objects.create(product=product, user=user, text='Есть размер L?')


@pytest.fixture
def question_answer(db, seller, product_question):
    return Answer.objects.create(question=product_question, user=seller, text='Да, есть')


# === Половина A: создание жалобы ===

@pytest.mark.django_db
def test_f18_create_report_requires_auth(api_client, buyer_review):
    """Жалоба от гостя -> 401 (IsAuthenticated)."""
    res = api_client.post('/api/products/reports/',
                          {'target_type': 'review', 'target_id': buyer_review.id,
                           'reason': 'spam'}, format='json')
    assert res.status_code == 401


@pytest.mark.django_db
def test_f18_create_report_success_201(buyer_review, seller):
    """Авторизованный жалуется на отзыв -> 201, запись open создана."""
    res = _client_as(seller).post('/api/products/reports/',
                                  {'target_type': 'review', 'target_id': buyer_review.id,
                                   'reason': 'fake', 'comment': 'накрутка'}, format='json')
    assert res.status_code == 201
    assert res.data['status'] == 'open'
    rep = Report.objects.get(id=res.data['id'])
    assert rep.target_type == 'review' and rep.reason == 'fake'
    assert rep.reporter_id == seller.id


@pytest.mark.django_db
def test_f18_create_report_dedup_200(buyer_review, seller):
    """Повторная открытая жалоба того же юзера на ту же цель -> 200, без дубля (§6)."""
    url = '/api/products/reports/'
    body = {'target_type': 'review', 'target_id': buyer_review.id, 'reason': 'spam'}
    r1 = _client_as(seller).post(url, body, format='json')
    r2 = _client_as(seller).post(url, body, format='json')
    assert r1.status_code == 201
    assert r2.status_code == 200
    assert Report.objects.filter(reporter=seller, target_type='review',
                                 target_id=buyer_review.id, status='open').count() == 1


@pytest.mark.django_db
def test_f18_create_report_missing_target_404(auth_client):
    """Несуществующая цель -> 404 (не 500)."""
    res = auth_client.post('/api/products/reports/',
                           {'target_type': 'review', 'target_id': 999999,
                            'reason': 'spam'}, format='json')
    assert res.status_code == 404


@pytest.mark.django_db
def test_f18_create_report_unknown_type_400(auth_client, buyer_review):
    """Тип вне allowlist -> 400 (анти-инъекция цели, §9)."""
    res = auth_client.post('/api/products/reports/',
                           {'target_type': 'order', 'target_id': buyer_review.id,
                            'reason': 'spam'}, format='json')
    assert res.status_code == 400


@pytest.mark.django_db
def test_f18_create_report_unknown_reason_400(auth_client, buyer_review):
    """Причина вне choices -> 400."""
    res = auth_client.post('/api/products/reports/',
                           {'target_type': 'review', 'target_id': buyer_review.id,
                            'reason': 'whatever'}, format='json')
    assert res.status_code == 400


# === Половина B: очередь и права ===

@pytest.mark.django_db
def test_f18_queue_requires_admin(seller, user, buyer_review):
    """Очередь жалоб - только админ: продавец/покупатель -> 403, гость -> 401 (§9)."""
    Report.objects.create(target_type='review', target_id=buyer_review.id, reason='spam')
    assert _client_as(seller).get('/api/products/reports/').status_code == 403
    assert _client_as(user).get('/api/products/reports/').status_code == 403
    assert _client_as().get('/api/products/reports/').status_code == 401


@pytest.mark.django_db
def test_f18_queue_lists_open_with_target_preview(admin_client, buyer_review, user):
    """Очередь отдаёт open-жалобы с превью цели; PII - только username, без email (§9)."""
    Report.objects.create(reporter=user, target_type='review',
                          target_id=buyer_review.id, reason='abuse', comment='хамство')
    res = admin_client.get('/api/products/reports/')
    assert res.status_code == 200
    row = res.data['results'][0]
    assert row['target']['exists'] is True
    assert row['target']['text'] == buyer_review.text
    assert row['reporter'] == user.username
    # PII-минимизация: email жалобщика/автора нигде не светится.
    import json
    assert user.email not in json.dumps(res.data)


@pytest.mark.django_db
def test_f18_queue_filter_and_deleted_target(admin_client, buyer_review):
    """?status= фильтрует; «протухшая» цель (удалена) не валит очередь (§6)."""
    rep = Report.objects.create(target_type='review', target_id=buyer_review.id, reason='spam')
    buyer_review.delete()
    res = admin_client.get('/api/products/reports/?status=open')
    assert res.status_code == 200
    row = [r for r in res.data['results'] if r['id'] == rep.id][0]
    assert row['target']['exists'] is False


# === Обработка: resolve / dismiss ===

@pytest.mark.django_db
def test_f18_resolve_hides_review_and_drops_rating(admin_client, product, buyer_review):
    """resolve жалобы на отзыв: отзыв скрыт, исключён из рейтинга и публичной
    выдачи; жалоба -> resolved (центральный эффект половины B, §4.3)."""
    product.refresh_from_db()
    assert product.reviews_count == 1 and product.rating == 5.0
    rep = Report.objects.create(target_type='review', target_id=buyer_review.id, reason='fake')

    res = admin_client.post(f'/api/products/reports/{rep.id}/resolve/', {}, format='json')
    assert res.status_code == 200
    rep.refresh_from_db(); buyer_review.refresh_from_db(); product.refresh_from_db()
    assert rep.status == 'resolved'
    assert buyer_review.is_hidden is True
    # Рейтинг и счётчик пересчитаны без скрытого отзыва (анти-накрутка).
    assert product.reviews_count == 0 and product.rating == 0
    # Не виден в публичном эндпоинте.
    pub = APIClient().get(f'/api/products/{product.id}/reviews/')
    assert all(r['id'] != buyer_review.id for r in pub.data['results'])


@pytest.mark.django_db
def test_f18_double_resolve_409(admin_client, buyer_review):
    """Повторная обработка уже закрытой жалобы -> 409, без второго действия (§6)."""
    rep = Report.objects.create(target_type='review', target_id=buyer_review.id, reason='spam')
    r1 = admin_client.post(f'/api/products/reports/{rep.id}/resolve/', {}, format='json')
    r2 = admin_client.post(f'/api/products/reports/{rep.id}/resolve/', {}, format='json')
    assert r1.status_code == 200 and r2.status_code == 409


@pytest.mark.django_db
def test_f18_dismiss_keeps_target(admin_client, buyer_review):
    """dismiss: жалоба -> dismissed, цель не трогаем."""
    rep = Report.objects.create(target_type='review', target_id=buyer_review.id, reason='other')
    res = admin_client.post(f'/api/products/reports/{rep.id}/dismiss/',
                            {'note': 'нарушения нет'}, format='json')
    assert res.status_code == 200
    rep.refresh_from_db(); buyer_review.refresh_from_db()
    assert rep.status == 'dismissed'
    assert buyer_review.is_hidden is False


@pytest.mark.django_db
def test_f18_resolve_action_requires_admin(seller, user, buyer_review):
    """resolve/dismiss - только админ (§9)."""
    rep = Report.objects.create(target_type='review', target_id=buyer_review.id, reason='spam')
    url = f'/api/products/reports/{rep.id}/resolve/'
    assert _client_as(seller).post(url, {}, format='json').status_code == 403
    assert _client_as(user).post(url, {}, format='json').status_code == 403
    assert _client_as().post(url, {}, format='json').status_code == 401


# === Проактивная модерация (hide/unhide без жалобы) ===

@pytest.mark.django_db
def test_f18_proactive_hide_unhide_review_recalcs_rating(admin_client, product, buyer_review):
    """hide отзыва исключает из рейтинга; unhide возвращает в выдачу и рейтинг."""
    res = admin_client.post(f'/api/products/reviews/{buyer_review.id}/hide/', {}, format='json')
    assert res.status_code == 200 and res.data['is_hidden'] is True
    product.refresh_from_db()
    assert product.reviews_count == 0 and product.rating == 0

    res = admin_client.post(f'/api/products/reviews/{buyer_review.id}/unhide/', {}, format='json')
    assert res.data['is_hidden'] is False
    product.refresh_from_db()
    assert product.reviews_count == 1 and product.rating == 5.0
    pub = APIClient().get(f'/api/products/{product.id}/reviews/')
    assert any(r['id'] == buyer_review.id for r in pub.data['results'])


@pytest.mark.django_db
def test_f18_hide_requires_admin(seller, user, buyer_review):
    """Проактивное скрытие - только админ (§9)."""
    url = f'/api/products/reviews/{buyer_review.id}/hide/'
    assert _client_as(seller).post(url, {}, format='json').status_code == 403
    assert _client_as().post(url, {}, format='json').status_code == 401


@pytest.mark.django_db
def test_f18_hide_idempotent(admin_client, product, buyer_review):
    """Повторный hide уже скрытого не плодит эффект (§6): рейтинг стабилен."""
    admin_client.post(f'/api/products/reviews/{buyer_review.id}/hide/', {}, format='json')
    admin_client.post(f'/api/products/reviews/{buyer_review.id}/hide/', {}, format='json')
    product.refresh_from_db()
    assert product.reviews_count == 0


# === Q&A: модерация вопросов/ответов (Этап 4, гейт Ф6 закрыт) ===

@pytest.mark.django_db
def test_f18_hide_question_removes_from_public(admin_client, product, product_question):
    """Скрытый вопрос пропадает из публичной ветки Q&A."""
    admin_client.post(f'/api/products/questions/{product_question.id}/hide/', {}, format='json')
    pub = APIClient().get(f'/api/products/{product.id}/questions/')
    assert all(q['id'] != product_question.id for q in pub.data['results'])


@pytest.mark.django_db
def test_f18_hide_answer_removes_from_public(admin_client, product, product_question, question_answer):
    """Скрытый ответ не виден в публичной ветке (лайки не «всплывают»)."""
    admin_client.post(f'/api/products/answers/{question_answer.id}/hide/', {}, format='json')
    pub = APIClient().get(f'/api/products/{product.id}/questions/')
    q = [q for q in pub.data['results'] if q['id'] == product_question.id][0]
    assert all(a['id'] != question_answer.id for a in q['answers'])


@pytest.mark.django_db
def test_f18_report_question_and_answer_allowed(auth_client, product_question, question_answer):
    """Жалоба на вопрос/ответ создаётся (Ф6 смержена -> типы в allowlist)."""
    r1 = auth_client.post('/api/products/reports/',
                          {'target_type': 'question', 'target_id': product_question.id,
                           'reason': 'spam'}, format='json')
    r2 = auth_client.post('/api/products/reports/',
                          {'target_type': 'answer', 'target_id': question_answer.id,
                           'reason': 'abuse'}, format='json')
    assert r1.status_code == 201 and r2.status_code == 201


# === Жалоба на товар: active -> hidden, moderation -> делегирование Ф17 ===

@pytest.mark.django_db
def test_f18_resolve_active_product_hides_and_deindexes(admin_client, product, monkeypatch):
    """Жалоба на активный товар: resolve -> status hidden + de-index ES + ушёл из
    каталога (собственное действие Ф18, не reject Ф17, §3)."""
    deleted = []
    monkeypatch.setattr('apps.products.moderation_ugc.delete_product',
                        lambda pid: deleted.append(pid))
    rep = Report.objects.create(target_type='product', target_id=product.id, reason='forbidden')
    res = admin_client.post(f'/api/products/reports/{rep.id}/resolve/', {}, format='json')
    assert res.status_code == 200
    product.refresh_from_db()
    assert product.status == 'hidden'
    assert deleted == [product.id]
    catalog = APIClient().get('/api/products/')
    assert product.id not in [p['id'] for p in catalog.data['results']]


@pytest.mark.django_db
def test_f18_resolve_moderation_product_delegates_reject(admin_client, pending_product):
    """Жалоба на товар в статусе moderation -> делегируется Ф17.reject
    (moderation -> rejected), а не hide (§3, краевой случай)."""
    rep = Report.objects.create(target_type='product', target_id=pending_product.id, reason='fraud')
    res = admin_client.post(f'/api/products/reports/{rep.id}/resolve/',
                            {'note': 'фрод'}, format='json')
    assert res.status_code == 200
    pending_product.refresh_from_db()
    assert pending_product.status == 'rejected'


@pytest.mark.django_db
def test_f18_resolve_seller_report_no_block(admin_client, seller):
    """Жалоба на продавца: resolve фиксирует заметкой, продавца НЕ блокирует
    (блокировка - Ф19, граница §7)."""
    rep = Report.objects.create(target_type='seller', target_id=seller.id, reason='fraud')
    res = admin_client.post(f'/api/products/reports/{rep.id}/resolve/',
                            {'note': 'передано в Ф19'}, format='json')
    assert res.status_code == 200
    rep.refresh_from_db(); seller.refresh_from_db()
    assert rep.status == 'resolved'
    assert seller.is_active is True  # не заблокирован