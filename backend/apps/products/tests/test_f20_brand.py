"""Тесты витрины бренда (Ф20, узел 1.21).

Покрывают: публичный профиль без PII, 404 на не-продавца/заблокированного, лента
?seller= только active, отзывы о продавце (если купил / не сам / не повторно),
денорм рейтинга продавца, подписка идемпотентна и не на себя, seller_id в карточке.
"""
import pytest
from django.core.cache import cache
from apps.products.models import BrandFollow, Category, Product, SellerReview
from apps.users.models import User


@pytest.fixture(autouse=True)
def clear_cache():
    cache.clear()
    yield
    cache.clear()


@pytest.fixture
def category(db):
    return Category.objects.create(name='Одежда', slug='clothes-f20')


@pytest.fixture
def brand_product(db, seller, category):
    return Product.objects.create(
        seller=seller, category=category, name='Платье бренда', slug='f20-dress',
        price=3000, stock=5, status='active',
    )


def _order_from(buyer, product):
    """Заказ покупателя с товаром продавца - даёт право на отзыв о продавце."""
    from apps.orders.models import Order, OrderItem
    order = Order.objects.create(buyer=buyer, total_price=product.price, delivery_address='адрес')
    OrderItem.objects.create(order=order, product=product, product_name=product.name,
                             quantity=1, price_at_purchase=product.price)
    return order


# --- Этап 1: публичный профиль бренда ---

@pytest.mark.django_db
def test_brand_profile_public_no_pii(api_client, seller, brand_product):
    """GET профиля публичен; отдаёт имя/рейтинг/число товаров, но НЕ email/phone (S17)."""
    seller.shop_name = 'Лавка'
    seller.phone = '+79990001122'
    seller.save(update_fields=['shop_name', 'phone'])
    r = api_client.get(f'/api/products/brand/{seller.id}/')
    assert r.status_code == 200
    assert r.data['name'] == 'Лавка'
    assert r.data['products_count'] == 1
    assert r.data['seller_reviews_count'] == 0
    body = str(r.data)
    assert seller.email not in body
    assert seller.phone not in body


@pytest.mark.django_db
def test_brand_profile_name_falls_back_to_username(api_client, seller):
    """Без shop_name отдаётся username как публичный хэндл (не email)."""
    r = api_client.get(f'/api/products/brand/{seller.id}/')
    assert r.status_code == 200
    assert r.data['name'] == seller.username


@pytest.mark.django_db
def test_brand_profile_404_for_non_seller(api_client, user):
    """id обычного покупателя -> 404 (витрина только у продавца)."""
    r = api_client.get(f'/api/products/brand/{user.id}/')
    assert r.status_code == 404


@pytest.mark.django_db
def test_brand_profile_404_for_missing(api_client):
    r = api_client.get('/api/products/brand/999999/')
    assert r.status_code == 404


@pytest.mark.django_db
def test_brand_profile_404_for_blocked_seller(api_client, seller):
    """Заблокированный продавец (is_active=False, Ф19) -> 404, не показываем витрину."""
    seller.is_active = False
    seller.save(update_fields=['is_active'])
    r = api_client.get(f'/api/products/brand/{seller.id}/')
    assert r.status_code == 404


@pytest.mark.django_db
def test_brand_profile_cached(api_client, seller):
    cache_key = f'brand:{seller.id}'
    assert cache.get(cache_key) is None
    api_client.get(f'/api/products/brand/{seller.id}/')
    assert cache.get(cache_key) is not None


@pytest.mark.django_db
def test_brand_profile_count_invalidated_on_product_change(api_client, seller, category):
    """Число товаров в шапке обновляется: новый active-товар сбрасывает кэш витрины."""
    r1 = api_client.get(f'/api/products/brand/{seller.id}/')
    assert r1.data['products_count'] == 0
    Product.objects.create(seller=seller, category=category, name='Новый', slug='f20-new',
                           price=100, stock=1, status='active')
    r2 = api_client.get(f'/api/products/brand/{seller.id}/')
    assert r2.data['products_count'] == 1


# --- Этап 2: лента товаров бренда ---

@pytest.mark.django_db
def test_brand_lane_only_own_active(api_client, seller, category, brand_product):
    """?seller= отдаёт только active-товары этого продавца; скрытый и чужой не видны."""
    Product.objects.create(seller=seller, category=category, name='Скрытый', slug='f20-hidden',
                           price=100, stock=1, status='hidden')
    other = User.objects.create_user(username='s2', email='s2@t.com', password='testpass123', role='seller')
    Product.objects.create(seller=other, category=category, name='Чужой', slug='f20-foreign',
                           price=100, stock=1, status='active')
    r = api_client.get(f'/api/products/?seller={seller.id}')
    assert r.status_code == 200
    names = [p['name'] for p in r.data['results']]
    assert names == ['Платье бренда']


@pytest.mark.django_db
def test_brand_lane_invalid_seller_empty_not_500(api_client, brand_product):
    """Нечисловой ?seller= -> пустая лента, не 500."""
    r = api_client.get('/api/products/?seller=abc')
    assert r.status_code == 200
    assert r.data['count'] == 0


@pytest.mark.django_db
def test_product_serializer_exposes_seller_id(api_client, brand_product, seller):
    """Карточка отдаёт seller_id для ссылки на витрину (замыкание forward Ф4)."""
    r = api_client.get(f'/api/products/{brand_product.id}/')
    assert r.status_code == 200
    assert r.data['seller_id'] == seller.id


# --- Этап 3: отзывы о продавце ---

@pytest.mark.django_db
def test_brand_review_list_public_no_email(api_client, seller, user):
    """Список отзывов публичен; автор - username, не email (S17)."""
    SellerReview.objects.create(seller=seller, author=user, rating=5, text='Быстро прислали')
    r = api_client.get(f'/api/products/brand/{seller.id}/reviews/')
    assert r.status_code == 200
    results = r.data['results'] if isinstance(r.data, dict) else r.data
    assert results[0]['author'] == user.username
    assert user.email not in str(r.data)


@pytest.mark.django_db
def test_brand_review_requires_purchase(auth_client, seller, brand_product, user):
    """Без покупки у продавца -> 403."""
    r = auth_client.post(f'/api/products/brand/{seller.id}/reviews/', {'rating': 5, 'text': 'ок'})
    assert r.status_code == 403
    assert SellerReview.objects.count() == 0


@pytest.mark.django_db
def test_brand_review_after_purchase_ok_and_rating_recalc(auth_client, seller, brand_product, user):
    """Купивший может оставить отзыв; рейтинг продавца денормализуется на User."""
    _order_from(user, brand_product)
    r = auth_client.post(f'/api/products/brand/{seller.id}/reviews/', {'rating': 4, 'text': 'норм'})
    assert r.status_code == 201
    seller.refresh_from_db()
    assert seller.seller_rating == 4
    assert seller.seller_reviews_count == 1


@pytest.mark.django_db
def test_brand_review_not_self(seller_client, seller, brand_product):
    """Продавец не оставляет отзыв сам себе -> 403."""
    r = seller_client.post(f'/api/products/brand/{seller.id}/reviews/', {'rating': 5, 'text': 'я молодец'})
    assert r.status_code == 403


@pytest.mark.django_db
def test_brand_review_no_duplicate(auth_client, seller, brand_product, user):
    """Повторный отзыв того же автора -> 400 (unique_together)."""
    _order_from(user, brand_product)
    auth_client.post(f'/api/products/brand/{seller.id}/reviews/', {'rating': 4, 'text': 'раз'})
    r = auth_client.post(f'/api/products/brand/{seller.id}/reviews/', {'rating': 2, 'text': 'два'})
    assert r.status_code == 400
    assert SellerReview.objects.filter(seller=seller, author=user).count() == 1


@pytest.mark.django_db
def test_brand_review_rating_zero_when_none(api_client, seller):
    """Ноль отзывов -> seller_rating=0 («нет оценок»), без деления на ноль."""
    seller.refresh_from_db()
    assert seller.seller_rating == 0
    assert seller.seller_reviews_count == 0


@pytest.mark.django_db
def test_brand_review_recalc_on_delete(seller, user, brand_product):
    """Удаление отзыва пересчитывает рейтинг продавца (сигнал post_delete)."""
    rev = SellerReview.objects.create(seller=seller, author=user, rating=5, text='супер')
    seller.refresh_from_db()
    assert seller.seller_reviews_count == 1
    rev.delete()
    seller.refresh_from_db()
    assert seller.seller_rating == 0
    assert seller.seller_reviews_count == 0


@pytest.mark.django_db
def test_brand_review_too_long_rejected(auth_client, seller, brand_product, user):
    """Слишком длинный текст -> 400, не запись мусора."""
    _order_from(user, brand_product)
    r = auth_client.post(f'/api/products/brand/{seller.id}/reviews/',
                         {'rating': 5, 'text': 'x' * 2001})
    assert r.status_code == 400


@pytest.mark.django_db
def test_brand_review_create_404_for_non_seller(auth_client, user):
    """Отзыв о не-продавце -> 404."""
    buyer2 = User.objects.create_user(username='b2', email='b2@t.com', password='testpass123', role='buyer')
    r = auth_client.post(f'/api/products/brand/{buyer2.id}/reviews/', {'rating': 5, 'text': 'ок'})
    assert r.status_code == 404


# --- Этап 4: подписка на бренд ---

@pytest.mark.django_db
def test_follow_toggle_idempotent(auth_client, seller, user):
    """Подписка/отписка идемпотентна: повторный toggle не плодит дубль."""
    r1 = auth_client.post(f'/api/products/brand/{seller.id}/follow/')
    assert r1.status_code == 200 and r1.data['following'] is True
    assert BrandFollow.objects.filter(follower=user, seller=seller).count() == 1
    r2 = auth_client.post(f'/api/products/brand/{seller.id}/follow/')
    assert r2.data['following'] is False
    assert BrandFollow.objects.filter(follower=user, seller=seller).count() == 0


@pytest.mark.django_db
def test_follow_status(auth_client, seller, user):
    """GET статуса отражает подписку текущего пользователя."""
    r0 = auth_client.get(f'/api/products/brand/{seller.id}/follow/')
    assert r0.data['following'] is False
    BrandFollow.objects.create(follower=user, seller=seller)
    r1 = auth_client.get(f'/api/products/brand/{seller.id}/follow/')
    assert r1.data['following'] is True


@pytest.mark.django_db
def test_follow_guest_status_false(api_client, seller):
    """Гость видит following:false (без 401 в лицо) - чтобы кнопка отрисовалась."""
    r = api_client.get(f'/api/products/brand/{seller.id}/follow/')
    assert r.status_code == 200
    assert r.data['following'] is False


@pytest.mark.django_db
def test_follow_anon_post_401(api_client, seller):
    """Анонимная попытка подписаться -> 401."""
    r = api_client.post(f'/api/products/brand/{seller.id}/follow/')
    assert r.status_code == 401


@pytest.mark.django_db
def test_follow_not_self(seller_client, seller):
    """Продавец не подписывается на свой магазин -> 403."""
    r = seller_client.post(f'/api/products/brand/{seller.id}/follow/')
    assert r.status_code == 403
    assert BrandFollow.objects.count() == 0
