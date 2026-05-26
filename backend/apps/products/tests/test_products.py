import pytest
from apps.products.models import Category, Product


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