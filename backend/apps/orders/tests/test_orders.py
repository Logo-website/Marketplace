import pytest
from apps.products.models import Category, Product
from apps.orders.models import Order


@pytest.fixture
def category(db):
    return Category.objects.create(name='Электроника', slug='electronics-orders')


@pytest.fixture
def product(db, seller, category):
    return Product.objects.create(
        seller=seller,
        category=category,
        name='Тестовый товар',
        slug='test-product-order',
        price=1000,
        stock=10,
        status='active'
    )


@pytest.mark.django_db
def test_create_order(auth_client, product):
    response = auth_client.post('/api/orders/', {
        'delivery_address': 'Москва, ул. Ленина 1',
        'items': [{'product': product.id, 'quantity': 2}]
    }, format='json')
    assert response.status_code == 201
    assert len(response.data['items']) == 1


@pytest.mark.django_db
def test_order_reduces_stock(auth_client, product):
    auth_client.post('/api/orders/', {
        'delivery_address': 'Москва',
        'items': [{'product': product.id, 'quantity': 3}]
    }, format='json')
    product.refresh_from_db()
    assert product.stock == 7


@pytest.mark.django_db
def test_order_exceeds_stock(auth_client, product):
    response = auth_client.post('/api/orders/', {
        'delivery_address': 'Москва',
        'items': [{'product': product.id, 'quantity': 99}]
    }, format='json')
    assert response.status_code == 400


@pytest.mark.django_db
def test_empty_order(auth_client):
    response = auth_client.post('/api/orders/', {
        'delivery_address': 'Москва',
        'items': []
    }, format='json')
    assert response.status_code == 400


@pytest.mark.django_db
def test_order_unauthorized(api_client, product):
    response = api_client.post('/api/orders/', {
        'delivery_address': 'Москва',
        'items': [{'product': product.id, 'quantity': 1}]
    }, format='json')
    assert response.status_code == 401


@pytest.mark.django_db
def test_order_list(auth_client, product):
    auth_client.post('/api/orders/', {
        'delivery_address': 'Москва',
        'items': [{'product': product.id, 'quantity': 1}]
    }, format='json')
    response = auth_client.get('/api/orders/')
    assert response.status_code == 200
    assert len(response.data['results']) == 1