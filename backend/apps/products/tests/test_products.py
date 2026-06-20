import pytest
from django.core.cache import cache
from apps.products.models import Category, Product, Review
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
def test_search_graceful_when_es_down(api_client, monkeypatch):
    """ES недоступен - поиск отдаёт 200 с пустым результатом, не 500 (graceful)."""
    def boom():
        raise ConnectionError('ES down')
    monkeypatch.setattr('apps.products.search.get_es', boom)

    response = api_client.get('/api/products/search/?q=куртка')
    assert response.status_code == 200
    assert response.data['count'] == 0
    assert response.data['results'] == []
    assert response.data['facets']['categories'] == []


@pytest.mark.django_db
def test_search_contract_with_facets(api_client, product, category, monkeypatch):
    """View собирает контракт: count, results в порядке ES, фасеты с именами категорий."""
    def fake_search(query, min_price=None, max_price=None, cat=None, page=1, page_size=20):
        return {
            'ids': [product.id],
            'total': 1,
            'facets': {
                'categories': [{'id': category.id, 'count': 1}],
                'price_ranges': [{'key': '0-1000', 'from': None, 'to': 1000, 'count': 1}],
            },
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
    """Безопасность: продавец не может PATCH'ем выставить status=active товару
    на модерации и обойти модерацию (status - read-only на seller-write пути)."""
    pending = Product.objects.create(
        seller=seller, category=category, name='На модерации',
        slug='pending', price=500, stock=3, status='moderation'
    )
    response = seller_client.patch(f'/api/products/my/{pending.id}/', {'status': 'active'})
    assert response.status_code == 200
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


@pytest.mark.django_db
def test_qa_helpful_missing_answer_404(auth_client):
    response = auth_client.post('/api/products/answers/999999/helpful/')
    assert response.status_code == 404