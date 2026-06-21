import pytest
from apps.products.models import Category, Product, Review
from apps.users.models import User


@pytest.fixture
def product(db, seller):
    category = Category.objects.create(name='Одежда', slug='clothes-myrev')
    return Product.objects.create(
        seller=seller, category=category, name='Куртка',
        slug='jacket-myrev', price=5000, stock=5, status='active',
    )


@pytest.mark.django_db
def test_my_reviews_only_own(auth_client, user, product):
    other = User.objects.create_user(
        username='other', email='other@test.com', password='x', role='buyer'
    )
    Review.objects.create(product=product, user=user, rating=5, text='Моя')
    Review.objects.create(product=product, user=other, rating=1, text='Чужая')

    r = auth_client.get('/api/products/reviews/my/')
    assert r.status_code == 200
    rows = r.data['results'] if isinstance(r.data, dict) else r.data
    assert len(rows) == 1
    assert rows[0]['text'] == 'Моя'
    assert rows[0]['product_name'] == 'Куртка'
    assert rows[0]['product_id'] == product.id


@pytest.mark.django_db
def test_my_reviews_requires_auth(api_client):
    r = api_client.get('/api/products/reviews/my/')
    assert r.status_code in (401, 403)
