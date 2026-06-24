import pytest
from decimal import Decimal
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


# Стресс-тест №5/C.3: прямой POST /orders/ закрыт. Создание заказа - только через
# /orders/from-cart/ (там guard согласия 54-ФЗ). OrderCreateSerializer удалён.
@pytest.mark.django_db
def test_direct_post_orders_closed(auth_client, product):
    # POST /orders/ больше не создаёт заказ -> 405 Method Not Allowed.
    r = auth_client.post('/api/orders/', {
        'delivery_address': 'Москва, ул. Ленина 1',
        'items': [{'product': product.id, 'quantity': 2}]
    }, format='json')
    assert r.status_code == 405
    # GET-список при этом продолжает работать.
    assert auth_client.get('/api/orders/').status_code == 200
    # Заказ не создан.
    assert not Order.objects.exists()


@pytest.mark.django_db
def test_order_create_serializer_removed():
    # Мёртвый сериализатор удалён из модуля (правило репо №3).
    from apps.orders import serializers as order_serializers
    assert not hasattr(order_serializers, 'OrderCreateSerializer')


@pytest.mark.django_db
def test_order_post_unauthorized(api_client, product):
    # Гость на /orders/ -> 401 (проверка прав раньше разбора метода).
    response = api_client.post('/api/orders/', {
        'delivery_address': 'Москва',
        'items': [{'product': product.id, 'quantity': 1}]
    }, format='json')
    assert response.status_code == 401


@pytest.mark.django_db
def test_order_list(auth_client, user, product, _clean_buyer_cart):
    add_to_cart(user.id, product.id, 1)
    auth_client.post('/api/orders/from-cart/',
                     {'delivery_address': 'Москва', 'accept_offer': True}, format='json')
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

def _order_via_cart(auth_client, user, product, qty):
    """Создаёт заказ боевым путём (from-cart): списывает сток, как прод."""
    add_to_cart(user.id, product.id, qty)
    r = auth_client.post('/api/orders/from-cart/',
                         {'delivery_address': 'Москва', 'accept_offer': True}, format='json')
    assert r.status_code == 201
    return Order.objects.get(buyer=user)


@pytest.mark.django_db
def test_buyer_cancel_restores_stock(auth_client, user, product, _clean_buyer_cart):
    # stock = 10, заказ на 3 -> 7, отмена -> снова 10
    order = _order_via_cart(auth_client, user, product, 3)
    product.refresh_from_db()
    assert product.stock == 7

    r = auth_client.post(f'/api/orders/{order.id}/cancel/')
    assert r.status_code == 200
    order.refresh_from_db()
    assert order.status == 'cancelled'
    product.refresh_from_db()
    assert product.stock == 10


@pytest.mark.django_db
def test_buyer_cancel_twice_rejected(auth_client, user, product, _clean_buyer_cart):
    order = _order_via_cart(auth_client, user, product, 2)

    first = auth_client.post(f'/api/orders/{order.id}/cancel/')
    assert first.status_code == 200
    second = auth_client.post(f'/api/orders/{order.id}/cancel/')
    assert second.status_code == 400
    # Повторная отмена не удвоила сток
    product.refresh_from_db()
    assert product.stock == 10


@pytest.mark.django_db
def test_buyer_cannot_cancel_shipped_order(auth_client, user, product, _clean_buyer_cart):
    order = _order_via_cart(auth_client, user, product, 1)
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
    r = auth_client.post('/api/orders/from-cart/', {'delivery_address': 'Москва', 'accept_offer': True}, format='json')
    assert r.status_code == 201
    product.refresh_from_db()
    assert product.stock == 8
    # Корзина очищена после оформления
    from apps.cart.cart import get_cart
    assert get_cart(user.id) == {}


@pytest.mark.django_db
def test_order_from_empty_cart_rejected(auth_client, user, _clean_buyer_cart):
    r = auth_client.post('/api/orders/from-cart/', {'delivery_address': 'Москва', 'accept_offer': True}, format='json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_order_from_cart_requires_address(auth_client, user, product, _clean_buyer_cart):
    add_to_cart(user.id, product.id, 1)
    r = auth_client.post('/api/orders/from-cart/', {'delivery_address': '  ', 'accept_offer': True}, format='json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_order_from_cart_inactive_product_rejected(auth_client, user, product, _clean_buyer_cart):
    # Товар стал неактивным между добавлением в корзину и оформлением
    add_to_cart(user.id, product.id, 1)
    product.status = 'hidden'
    product.save(update_fields=['status'])
    r = auth_client.post('/api/orders/from-cart/', {'delivery_address': 'Москва', 'accept_offer': True}, format='json')
    assert r.status_code == 400
    # Сток не списан
    product.refresh_from_db()
    assert product.stock == 10


@pytest.mark.django_db
def test_order_from_cart_exceeds_stock_rejected(auth_client, user, product, _clean_buyer_cart):
    # В корзине больше, чем на складе (stock=10) -> validate_cart_items отдаёт ошибку
    add_to_cart(user.id, product.id, 99)
    r = auth_client.post('/api/orders/from-cart/', {'delivery_address': 'Москва', 'accept_offer': True}, format='json')
    assert r.status_code == 400
    product.refresh_from_db()
    assert product.stock == 10


@pytest.mark.django_db
def test_second_order_cannot_oversell_stock(auth_client, user, product, _clean_buyer_cart):
    # Детерминированный аналог гонки: первый заказ забирает почти весь сток,
    # второй на больший объём - отклонён, сток не уходит в минус.
    _order_via_cart(auth_client, user, product, 9)
    product.refresh_from_db()
    assert product.stock == 1

    add_to_cart(user.id, product.id, 2)
    r = auth_client.post('/api/orders/from-cart/',
                         {'delivery_address': 'Москва', 'accept_offer': True}, format='json')
    assert r.status_code == 400
    product.refresh_from_db()
    assert product.stock == 1


# --- Ф19: реестр заказов в админке (узел 3.4, поиск по id/почте) ---

@pytest.mark.django_db
def test_f19_admin_order_search_by_id(client, admin, user):
    """Поиск по точному id заказа находит его (search_fields '=id')."""
    order = Order.objects.create(buyer=user, total_price=Decimal('100'))
    client.force_login(admin)
    res = client.get(f'/admin/orders/order/?q={order.id}')
    assert res.status_code == 200
    assert str(order.id).encode() in res.content


@pytest.mark.django_db
def test_f19_admin_order_search_nonnumeric_no_500(client, admin, user):
    """Нечисловой терм в поиске ('=id' на integer-поле) не роняет 500 (§6)."""
    Order.objects.create(buyer=user, total_price=Decimal('100'))
    client.force_login(admin)
    res = client.get('/admin/orders/order/?q=notanumber')
    assert res.status_code == 200


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
        'accept_offer': True,
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
        'accept_offer': True,
        'items': [{'product_id': 999999}],
    }, format='json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_order_from_cart_saves_variant(auth_client, user, product, _clean_buyer_cart):
    # Размер/цвет из корзины сохраняются в OrderItem (снимок варианта).
    add_to_cart(user.id, cart_key(product.id, 'M', 'Чёрный'), 1)
    r = auth_client.post('/api/orders/from-cart/', {'delivery_address': 'Москва', 'accept_offer': True}, format='json')
    assert r.status_code == 201
    item = Order.objects.get(buyer=user).items.first()
    assert item.size == 'M'
    assert item.color == 'Чёрный'


# --- Ф9: снимок чекаута (получатель, способ доставки/оплаты) ---

@pytest.mark.django_db
def test_order_from_cart_saves_checkout_snapshot(auth_client, user, product, _clean_buyer_cart):
    # Получатель и способы доставки/оплаты сохраняются в заказ (видны в профиле).
    add_to_cart(user.id, cart_key(product.id), 1)
    r = auth_client.post('/api/orders/from-cart/', {
        'delivery_address': 'Москва',
        'accept_offer': True,
        'recipient_name': 'Иван Иванов',
        'recipient_phone': '+79991234567',
        'recipient_email': 'ivan@test.com',
        'delivery_method': 'courier',
        'payment_method': 'on_delivery',
    }, format='json')
    assert r.status_code == 201
    assert r.data['recipient_name'] == 'Иван Иванов'
    assert r.data['delivery_method'] == 'courier'
    assert r.data['payment_method'] == 'on_delivery'
    order = Order.objects.get(buyer=user)
    assert order.recipient_phone == '+79991234567'
    assert order.recipient_email == 'ivan@test.com'


@pytest.mark.django_db
def test_order_from_cart_defaults_delivery_payment(auth_client, user, product, _clean_buyer_cart):
    # Способы не переданы -> дефолты модели (pickup/card), без ошибки.
    add_to_cart(user.id, cart_key(product.id), 1)
    r = auth_client.post('/api/orders/from-cart/', {'delivery_address': 'Москва', 'accept_offer': True}, format='json')
    assert r.status_code == 201
    assert r.data['delivery_method'] == 'pickup'
    assert r.data['payment_method'] == 'card'


@pytest.mark.django_db
def test_order_from_cart_invalid_delivery_method_rejected(auth_client, user, product, _clean_buyer_cart):
    # Способ доставки вне набора choices -> 400, заказ не создаётся.
    add_to_cart(user.id, cart_key(product.id), 1)
    r = auth_client.post('/api/orders/from-cart/', {
        'delivery_address': 'Москва',
        'accept_offer': True,
        'delivery_method': 'teleport',
    }, format='json')
    assert r.status_code == 400
    assert not Order.objects.filter(buyer=user).exists()


@pytest.mark.django_db
def test_order_from_cart_invalid_payment_method_rejected(auth_client, user, product, _clean_buyer_cart):
    # Способ оплаты вне набора choices -> 400, заказ не создаётся.
    add_to_cart(user.id, cart_key(product.id), 1)
    r = auth_client.post('/api/orders/from-cart/', {
        'delivery_address': 'Москва',
        'accept_offer': True,
        'payment_method': 'bitcoin',
    }, format='json')
    assert r.status_code == 400
    assert not Order.objects.filter(buyer=user).exists()


@pytest.mark.django_db
def test_order_from_cart_null_recipient_not_crash(auth_client, user, product, _clean_buyer_cart):
    # Клиент прислал null в поле получателя -> не 500, поле пустеет.
    add_to_cart(user.id, cart_key(product.id), 1)
    r = auth_client.post('/api/orders/from-cart/', {
        'delivery_address': 'Москва',
        'accept_offer': True,
        'recipient_name': None,
    }, format='json')
    assert r.status_code == 201
    assert r.data['recipient_name'] == ''


# --- Стресс-тест №2/№8: длина полей чекаута -> 400, не 500 ---

@pytest.mark.django_db
def test_order_from_cart_long_phone_rejected(auth_client, user, product, _clean_buyer_cart):
    # Телефон сверх varchar(20) -> 400 (раньше Postgres "value too long" = 500).
    add_to_cart(user.id, product.id, 1)
    r = auth_client.post('/api/orders/from-cart/', {
        'delivery_address': 'Москва', 'accept_offer': True,
        'recipient_phone': '+7 (999) 123-45-67 доб. 1234',  # 28 символов
    }, format='json')
    assert r.status_code == 400
    assert not Order.objects.filter(buyer=user).exists()
    product.refresh_from_db()
    assert product.stock == 10  # сток не списан, транзакция не открывалась


@pytest.mark.django_db
def test_order_from_cart_long_email_rejected(auth_client, user, product, _clean_buyer_cart):
    # E-mail сверх varchar(254) -> 400.
    add_to_cart(user.id, product.id, 1)
    long_email = 'a' * 250 + '@x.ru'  # 255 символов
    r = auth_client.post('/api/orders/from-cart/', {
        'delivery_address': 'Москва', 'accept_offer': True,
        'recipient_email': long_email,
    }, format='json')
    assert r.status_code == 400
    assert not Order.objects.filter(buyer=user).exists()


@pytest.mark.django_db
def test_order_from_cart_long_name_rejected(auth_client, user, product, _clean_buyer_cart):
    # Имя сверх varchar(200) -> 400.
    add_to_cart(user.id, product.id, 1)
    r = auth_client.post('/api/orders/from-cart/', {
        'delivery_address': 'Москва', 'accept_offer': True,
        'recipient_name': 'И' * 201,
    }, format='json')
    assert r.status_code == 400
    assert not Order.objects.filter(buyer=user).exists()


@pytest.mark.django_db
def test_order_from_cart_long_address_rejected(auth_client, user, product, _clean_buyer_cart):
    # Адрес (TextField без DB-границы) сверх product-лимита 500 -> 400.
    add_to_cart(user.id, product.id, 1)
    r = auth_client.post('/api/orders/from-cart/', {
        'delivery_address': 'М' * 501, 'accept_offer': True,
    }, format='json')
    assert r.status_code == 400
    assert not Order.objects.filter(buyer=user).exists()


@pytest.mark.django_db
def test_order_from_cart_long_comment_rejected(auth_client, user, product, _clean_buyer_cart):
    # Комментарий сверх лимита 1000 -> 400.
    add_to_cart(user.id, product.id, 1)
    r = auth_client.post('/api/orders/from-cart/', {
        'delivery_address': 'Москва', 'accept_offer': True,
        'comment': 'к' * 1001,
    }, format='json')
    assert r.status_code == 400
    assert not Order.objects.filter(buyer=user).exists()


# --- Ф14: заказы продавца (list/detail, авторизация, смешанный заказ) ---

@pytest.mark.django_db
def test_seller_order_list_only_own(seller_client, user, product, other_seller_product):
    # В списке - только заказы с позицией продавца; чисто чужой заказ не виден.
    own = _make_order(user, product)
    foreign = _make_order(user, other_seller_product)
    r = seller_client.get('/api/orders/seller/')
    assert r.status_code == 200
    ids = [o['id'] for o in r.data['results']]
    assert own.id in ids
    assert foreign.id not in ids


@pytest.mark.django_db
def test_seller_order_detail_foreign_404(seller_client, user, other_seller_product):
    # Прямой запрос чужого заказа по id -> 404 (queryset фильтрует по владению).
    foreign = _make_order(user, other_seller_product)
    r = seller_client.get(f'/api/orders/seller/{foreign.id}/')
    assert r.status_code == 404


@pytest.mark.django_db
def test_seller_order_list_buyer_forbidden(auth_client):
    # Покупатель на seller-эндпоинт -> 403 (IsSellerOrAdmin).
    r = auth_client.get('/api/orders/seller/')
    assert r.status_code == 403


@pytest.mark.django_db
def test_seller_order_list_guest_unauthorized(api_client):
    # Гость -> 401.
    r = api_client.get('/api/orders/seller/')
    assert r.status_code == 401


@pytest.mark.django_db
def test_seller_order_list_status_filter(seller_client, user, product):
    _make_order(user, product)  # created
    paid = _make_order(user, product)
    paid.status = 'paid'
    paid.save(update_fields=['status'])
    r = seller_client.get('/api/orders/seller/?status=paid')
    assert r.status_code == 200
    assert [o['id'] for o in r.data['results']] == [paid.id]


@pytest.mark.django_db
def test_seller_order_list_unknown_status_empty(seller_client, user, product):
    # Несуществующий статус -> пустой список, не 500.
    _make_order(user, product)
    r = seller_client.get('/api/orders/seller/?status=teleport')
    assert r.status_code == 200
    assert r.data['results'] == []


@pytest.mark.django_db
def test_seller_own_order_can_update_and_total(seller_client, user, product):
    # Заказ целиком из своих товаров: can_update_status=true, сумма своих позиций.
    own = _make_order(user, product)
    r = seller_client.get(f'/api/orders/seller/{own.id}/')
    assert r.status_code == 200
    assert r.data['can_update_status'] is True
    assert Decimal(r.data['seller_total']) == Decimal('1000')


@pytest.mark.django_db
def test_seller_mixed_order_visible_but_readonly(seller_client, user, product, other_seller_product):
    # Смешанный заказ виден, но read-only; чужие позиции и полный total_price
    # не утекают, сумма - только своих позиций (план 4.2, часть 9).
    mixed = _make_order(user, product, other_seller_product)
    listing = seller_client.get('/api/orders/seller/')
    assert mixed.id in [o['id'] for o in listing.data['results']]

    d = seller_client.get(f'/api/orders/seller/{mixed.id}/')
    assert d.status_code == 200
    assert d.data['can_update_status'] is False
    names = [it['product_name'] for it in d.data['items']]
    assert product.name in names
    assert other_seller_product.name not in names
    assert 'total_price' not in d.data
    # Только своя позиция (1000), не сумма всего заказа (1000 + 500).
    assert Decimal(d.data['seller_total']) == Decimal('1000')


@pytest.mark.django_db
def test_seller_order_no_buyer_contact_leak(seller_client, user, product):
    # PII-минимизация: e-mail/телефон покупателя не отдаются продавцу (план 4.4).
    own = _make_order(user, product)
    d = seller_client.get(f'/api/orders/seller/{own.id}/')
    body = str(d.data)
    assert 'recipient_email' not in d.data
    assert 'recipient_phone' not in d.data
    assert user.email not in body