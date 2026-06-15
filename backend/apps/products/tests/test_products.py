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
def test_seller_shop_name_used_when_set(api_client, product, seller):
    """Если у продавца задан shop_name - отдаётся он, а не username."""
    seller.shop_name = 'Бренд Премиум'
    seller.save(update_fields=['shop_name'])
    cache.clear()  # карточка кэшируется (P6b) - сбросить старую сериализацию
    response = api_client.get(f'/api/products/{product.id}/')
    assert response.status_code == 200
    assert response.data['seller_name'] == 'Бренд Премиум'