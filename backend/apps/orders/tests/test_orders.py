import pytest
from apps.products.models import Category, Product
from apps.orders.models import Order, OrderItem
from apps.users.models import User
from apps.cart.cart import add_to_cart, clear_cart, cart_key, get_cart


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


# --- P2: мультивендор-авторизация статуса заказа (S4) ---

def _make_order(buyer, *products):
    order = Order.objects.create(buyer=buyer, delivery_address='Москва', total_price=1000)
    for p in products:
        OrderItem.objects.create(
            order=order, product=p, product_name=p.name,
            quantity=1, price_at_purchase=p.price,
        )
    return order


@pytest.fixture
def other_seller_product(db, category):
    other = User.objects.create_user(
        username='seller2', email='seller2@test.com', password='x', role='seller',
    )
    return Product.objects.create(
        seller=other, category=category, name='Чужой товар',
        slug='foreign-product', price=500, stock=10, status='active',
    )


@pytest.mark.django_db
def test_seller_can_update_own_order(seller_client, user, product):
    # Заказ целиком из товаров этого продавца - доступен
    order = _make_order(user, product)
    r = seller_client.patch(f'/api/orders/{order.id}/status/', {'status': 'paid'}, format='json')
    assert r.status_code == 200


@pytest.mark.django_db
def test_seller_cannot_update_mixed_order(seller_client, user, product, other_seller_product):
    # Смешанный заказ (свой + чужой товар) продавцу недоступен -> 404
    order = _make_order(user, product, other_seller_product)
    r = seller_client.patch(f'/api/orders/{order.id}/status/', {'status': 'cancelled'}, format='json')
    assert r.status_code == 404
    # Сток чужого товара не восстановлен
    other_seller_product.refresh_from_db()
    assert other_seller_product.stock == 10
    order.refresh_from_db()
    assert order.status == 'created'


# --- P4: покупательский flow отмены (возврат стока, идемпотентность) ---

@pytest.mark.django_db
def test_buyer_cancel_restores_stock(auth_client, product):
    # stock = 10, заказ на 3 -> 7, отмена -> снова 10
    auth_client.post('/api/orders/', {
        'delivery_address': 'Москва',
        'items': [{'product': product.id, 'quantity': 3}]
    }, format='json')
    product.refresh_from_db()
    assert product.stock == 7

    order = Order.objects.get(buyer__email='test@test.com')
    r = auth_client.post(f'/api/orders/{order.id}/cancel/')
    assert r.status_code == 200
    order.refresh_from_db()
    assert order.status == 'cancelled'
    product.refresh_from_db()
    assert product.stock == 10


@pytest.mark.django_db
def test_buyer_cancel_twice_rejected(auth_client, product):
    auth_client.post('/api/orders/', {
        'delivery_address': 'Москва',
        'items': [{'product': product.id, 'quantity': 2}]
    }, format='json')
    order = Order.objects.get(buyer__email='test@test.com')

    first = auth_client.post(f'/api/orders/{order.id}/cancel/')
    assert first.status_code == 200
    second = auth_client.post(f'/api/orders/{order.id}/cancel/')
    assert second.status_code == 400
    # Повторная отмена не удвоила сток
    product.refresh_from_db()
    assert product.stock == 10


@pytest.mark.django_db
def test_buyer_cannot_cancel_shipped_order(auth_client, product):
    auth_client.post('/api/orders/', {
        'delivery_address': 'Москва',
        'items': [{'product': product.id, 'quantity': 1}]
    }, format='json')
    order = Order.objects.get(buyer__email='test@test.com')
    order.status = 'shipped'
    order.save(update_fields=['status'])

    r = auth_client.post(f'/api/orders/{order.id}/cancel/')
    assert r.status_code == 400
    # Сток не вернулся
    product.refresh_from_db()
    assert product.stock == 9


@pytest.mark.django_db
def test_buyer_cannot_cancel_foreign_order(auth_client, seller, product):
    # Чужой заказ не виден покупателю -> 404
    foreign = _make_order(seller, product)
    r = auth_client.post(f'/api/orders/{foreign.id}/cancel/')
    assert r.status_code == 404


# --- P4: заказ из корзины (OrderFromCartView) ---

@pytest.fixture
def _clean_buyer_cart(user):
    clear_cart(user.id)
    yield
    clear_cart(user.id)


@pytest.mark.django_db
def test_order_from_cart(auth_client, user, product, _clean_buyer_cart):
    add_to_cart(user.id, product.id, 2)
    r = auth_client.post('/api/orders/from-cart/', {'delivery_address': 'Москва'}, format='json')
    assert r.status_code == 201
    product.refresh_from_db()
    assert product.stock == 8
    # Корзина очищена после оформления
    from apps.cart.cart import get_cart
    assert get_cart(user.id) == {}


@pytest.mark.django_db
def test_order_from_empty_cart_rejected(auth_client, user, _clean_buyer_cart):
    r = auth_client.post('/api/orders/from-cart/', {'delivery_address': 'Москва'}, format='json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_order_from_cart_requires_address(auth_client, user, product, _clean_buyer_cart):
    add_to_cart(user.id, product.id, 1)
    r = auth_client.post('/api/orders/from-cart/', {'delivery_address': '  '}, format='json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_order_from_cart_inactive_product_rejected(auth_client, user, product, _clean_buyer_cart):
    # Товар стал неактивным между добавлением в корзину и оформлением
    add_to_cart(user.id, product.id, 1)
    product.status = 'hidden'
    product.save(update_fields=['status'])
    r = auth_client.post('/api/orders/from-cart/', {'delivery_address': 'Москва'}, format='json')
    assert r.status_code == 400
    # Сток не списан
    product.refresh_from_db()
    assert product.stock == 10


@pytest.mark.django_db
def test_order_from_cart_exceeds_stock_rejected(auth_client, user, product, _clean_buyer_cart):
    # В корзине больше, чем на складе (stock=10) -> validate_cart_items отдаёт ошибку
    add_to_cart(user.id, product.id, 99)
    r = auth_client.post('/api/orders/from-cart/', {'delivery_address': 'Москва'}, format='json')
    assert r.status_code == 400
    product.refresh_from_db()
    assert product.stock == 10


@pytest.mark.django_db
def test_second_order_cannot_oversell_stock(auth_client, product):
    # Детерминированный аналог гонки: первый заказ забирает почти весь сток,
    # второй на больший объём - отклонён, сток не уходит в минус.
    auth_client.post('/api/orders/', {
        'delivery_address': 'Москва',
        'items': [{'product': product.id, 'quantity': 9}]
    }, format='json')
    product.refresh_from_db()
    assert product.stock == 1

    r = auth_client.post('/api/orders/', {
        'delivery_address': 'Москва',
        'items': [{'product': product.id, 'quantity': 2}]
    }, format='json')
    assert r.status_code == 400
    product.refresh_from_db()
    assert product.stock == 1


# --- Ф8: честный выбор позиций и вариант в заказе ---

@pytest.fixture
def product2(db, seller, category):
    return Product.objects.create(
        seller=seller, category=category, name='Второй товар',
        slug='second-product-order', price=500, stock=10, status='active',
    )


@pytest.mark.django_db
def test_order_from_cart_subset_leaves_rest(auth_client, user, product, product2, _clean_buyer_cart):
    # В корзине два товара, оформляем только один - второй остаётся в корзине.
    add_to_cart(user.id, cart_key(product.id), 1)
    add_to_cart(user.id, cart_key(product2.id), 1)
    r = auth_client.post('/api/orders/from-cart/', {
        'delivery_address': 'Москва',
        'items': [{'product_id': product.id}],
    }, format='json')
    assert r.status_code == 201
    assert len(r.data['items']) == 1
    cart = get_cart(user.id)
    assert cart_key(product.id) not in cart   # оформленный убран
    assert cart_key(product2.id) in cart       # невыбранный остался


@pytest.mark.django_db
def test_order_from_cart_empty_selection_rejected(auth_client, user, product, _clean_buyer_cart):
    # Переданы позиции, которых нет в корзине -> нечего оформлять.
    add_to_cart(user.id, cart_key(product.id), 1)
    r = auth_client.post('/api/orders/from-cart/', {
        'delivery_address': 'Москва',
        'items': [{'product_id': 999999}],
    }, format='json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_order_from_cart_saves_variant(auth_client, user, product, _clean_buyer_cart):
    # Размер/цвет из корзины сохраняются в OrderItem (снимок варианта).
    add_to_cart(user.id, cart_key(product.id, 'M', 'Чёрный'), 1)
    r = auth_client.post('/api/orders/from-cart/', {'delivery_address': 'Москва'}, format='json')
    assert r.status_code == 201
    item = Order.objects.get(buyer=user).items.first()
    assert item.size == 'M'
    assert item.color == 'Чёрный'