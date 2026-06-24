from decimal import Decimal

import pytest
from apps.products.models import Category, Product
from .cart import clear_cart, cart_key, add_to_cart


@pytest.fixture
def category(db):
    return Category.objects.create(name='Одежда', slug='clothes-cart')


@pytest.fixture
def product(db, seller, category):
    return Product.objects.create(
        seller=seller,
        category=category,
        name='Куртка',
        slug='jacket-cart',
        price=5000,
        stock=5,
        status='active',
    )


@pytest.fixture
def product2(db, seller, category):
    return Product.objects.create(
        seller=seller,
        category=category,
        name='Джинсы',
        slug='jeans-cart',
        price=3000,
        stock=8,
        status='active',
    )


@pytest.fixture(autouse=True)
def _clean_cart(user):
    """
    Redis не откатывается транзакцией теста (в отличие от БД), а id пользователя
    может переиспользоваться между тестами - чистим корзину до и после.
    """
    clear_cart(user.id)
    yield
    clear_cart(user.id)


@pytest.mark.django_db
def test_add_to_cart(auth_client, product):
    r = auth_client.post('/api/cart/', {'product_id': product.id, 'quantity': 2}, format='json')
    assert r.status_code == 200
    # Ключ позиции - составной (product|size|color), пустой вариант по умолчанию.
    assert r.data['cart'][cart_key(product.id)] == 2


@pytest.mark.django_db
def test_get_cart_returns_items_and_total(auth_client, product):
    auth_client.post('/api/cart/', {'product_id': product.id, 'quantity': 2}, format='json')
    r = auth_client.get('/api/cart/')
    assert r.status_code == 200
    assert len(r.data['items']) == 1
    assert r.data['items'][0]['quantity'] == 2
    assert r.data['items'][0]['seller_name']  # группировка по продавцу
    assert Decimal(r.data['total']) == product.price * 2


@pytest.mark.django_db
def test_empty_cart_is_empty(auth_client):
    r = auth_client.get('/api/cart/')
    assert r.status_code == 200
    assert r.data['items'] == []
    assert r.data['total'] == '0'


@pytest.mark.django_db
def test_add_exceeds_stock_rejected(auth_client, product):
    # stock = 5
    r = auth_client.post('/api/cart/', {'product_id': product.id, 'quantity': 6}, format='json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_add_accumulates_respecting_stock(auth_client, product):
    # stock = 5: 3 проходит, ещё 3 (итого 6) - превышает остаток
    r1 = auth_client.post('/api/cart/', {'product_id': product.id, 'quantity': 3}, format='json')
    assert r1.status_code == 200
    r2 = auth_client.post('/api/cart/', {'product_id': product.id, 'quantity': 3}, format='json')
    assert r2.status_code == 400


@pytest.mark.django_db
def test_add_inactive_product_not_found(auth_client, product):
    product.status = 'hidden'
    product.save(update_fields=['status'])
    r = auth_client.post('/api/cart/', {'product_id': product.id, 'quantity': 1}, format='json')
    assert r.status_code == 404


@pytest.mark.django_db
def test_add_invalid_quantity_rejected(auth_client, product):
    r = auth_client.post('/api/cart/', {'product_id': product.id, 'quantity': 0}, format='json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_variant_creates_separate_lines(auth_client, product):
    # Один товар в двух размерах = две строки корзины (составной ключ).
    auth_client.post('/api/cart/', {'product_id': product.id, 'quantity': 1, 'size': 'M'}, format='json')
    auth_client.post('/api/cart/', {'product_id': product.id, 'quantity': 1, 'size': 'L'}, format='json')
    r = auth_client.get('/api/cart/')
    assert len(r.data['items']) == 2
    sizes = {i['size'] for i in r.data['items']}
    assert sizes == {'M', 'L'}


@pytest.mark.django_db
def test_put_sets_exact_quantity(auth_client, product):
    # stock = 5
    auth_client.post('/api/cart/', {'product_id': product.id, 'quantity': 2}, format='json')
    r = auth_client.put('/api/cart/', {'product_id': product.id, 'quantity': 5}, format='json')
    assert r.status_code == 200
    after = auth_client.get('/api/cart/')
    assert after.data['items'][0]['quantity'] == 5


@pytest.mark.django_db
def test_put_exceeds_stock_keeps_quantity(auth_client, product):
    # Превышение стока через PUT отклоняется, прежнее количество сохраняется.
    auth_client.post('/api/cart/', {'product_id': product.id, 'quantity': 2}, format='json')
    r = auth_client.put('/api/cart/', {'product_id': product.id, 'quantity': 6}, format='json')
    assert r.status_code == 400
    after = auth_client.get('/api/cart/')
    assert after.data['items'][0]['quantity'] == 2


@pytest.mark.django_db
def test_remove_specific_line(auth_client, product):
    auth_client.post('/api/cart/', {'product_id': product.id, 'quantity': 2}, format='json')
    r = auth_client.delete('/api/cart/', {'product_id': product.id}, format='json')
    assert r.status_code == 200
    assert cart_key(product.id) not in r.data['cart']


@pytest.mark.django_db
def test_clear_cart(auth_client, product):
    auth_client.post('/api/cart/', {'product_id': product.id, 'quantity': 2}, format='json')
    r = auth_client.delete('/api/cart/', {}, format='json')
    assert r.status_code == 200
    after = auth_client.get('/api/cart/')
    assert after.data['items'] == []


@pytest.mark.django_db
def test_cart_requires_auth(api_client, product):
    r = api_client.post('/api/cart/', {'product_id': product.id, 'quantity': 1}, format='json')
    assert r.status_code == 401


@pytest.mark.django_db
def test_merge_guest_cart_clamps_stock(auth_client, user, product):
    # stock = 5: гостевая корзина с 99 -> обрезается до стока, не reject.
    r = auth_client.post('/api/cart/merge/', {
        'items': [{'product_id': product.id, 'quantity': 99}]
    }, format='json')
    assert r.status_code == 200
    assert len(r.data['items']) == 1
    assert r.data['items'][0]['quantity'] == 5


@pytest.mark.django_db
def test_merge_sums_with_existing(auth_client, user, product):
    # На сервере уже 2, гость добавляет 1 -> 3 (в пределах стока 5).
    add_to_cart(user.id, cart_key(product.id), 2)
    r = auth_client.post('/api/cart/merge/', {
        'items': [{'product_id': product.id, 'quantity': 1}]
    }, format='json')
    assert r.data['items'][0]['quantity'] == 3


@pytest.mark.django_db
def test_merge_skips_inactive(auth_client, user, product):
    product.status = 'hidden'
    product.save(update_fields=['status'])
    r = auth_client.post('/api/cart/merge/', {
        'items': [{'product_id': product.id, 'quantity': 1}]
    }, format='json')
    assert r.status_code == 200
    assert r.data['items'] == []


@pytest.mark.django_db
def test_long_size_rejected(auth_client, product):
    """№6 (стресс-тест 2026-06-24): size длиннее капа OrderItem.size (50) -> 400,
    иначе позиция прошла бы в корзину, но упала при переносе в заказ."""
    r = auth_client.post(
        '/api/cart/',
        {'product_id': product.id, 'quantity': 1, 'size': 'X' * 51},
        format='json',
    )
    assert r.status_code == 400


@pytest.mark.django_db
def test_long_color_rejected(auth_client, product):
    """№6: color длиннее капа OrderItem.color (50) -> 400."""
    r = auth_client.post(
        '/api/cart/',
        {'product_id': product.id, 'quantity': 1, 'color': 'Ц' * 51},
        format='json',
    )
    assert r.status_code == 400


@pytest.mark.django_db
def test_max_length_size_color_accepted(auth_client, product):
    """№6 (граница): ровно 50 символов проходит - кап не отрезает валидные значения."""
    r = auth_client.post(
        '/api/cart/',
        {'product_id': product.id, 'quantity': 1, 'size': 'S' * 50, 'color': 'K' * 50},
        format='json',
    )
    assert r.status_code == 200


@pytest.mark.django_db
def test_batch_products_by_ids(auth_client, product, product2):
    # Гостевая корзина дочитывает товары по списку id одним запросом, без пагинации.
    r = auth_client.get(f'/api/products/?ids={product.id},{product2.id}')
    assert r.status_code == 200
    assert isinstance(r.data, list)  # ветка ids не пагинируется
    ids = {p['id'] for p in r.data}
    assert ids == {product.id, product2.id}
