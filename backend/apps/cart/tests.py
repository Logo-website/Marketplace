from decimal import Decimal

import pytest
from apps.products.models import Category, Product
from .cart import clear_cart


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
    assert r.data['cart'][str(product.id)] == 2


@pytest.mark.django_db
def test_get_cart_returns_items_and_total(auth_client, product):
    auth_client.post('/api/cart/', {'product_id': product.id, 'quantity': 2}, format='json')
    r = auth_client.get('/api/cart/')
    assert r.status_code == 200
    assert len(r.data['items']) == 1
    assert r.data['items'][0]['quantity'] == 2
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
def test_remove_from_cart(auth_client, product):
    auth_client.post('/api/cart/', {'product_id': product.id, 'quantity': 2}, format='json')
    r = auth_client.delete('/api/cart/', {'product_id': product.id}, format='json')
    assert r.status_code == 200
    assert str(product.id) not in r.data['cart']


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
