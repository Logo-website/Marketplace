"""Тесты возвратов (Ф23): право/срок/только delivered, машина статусов, сток при
приёмке, мультивендор (S4), спор->арбитраж, без PII. Покрывают критерии §10/§5 плана."""
import json
import pytest
from datetime import timedelta
from django.utils import timezone
from apps.products.models import Category, Product
from apps.orders.models import Order, OrderItem, ReturnRequest, ReturnItem
from apps.users.models import User


@pytest.fixture
def category(db):
    return Category.objects.create(name='Одежда', slug='clothes-returns')


@pytest.fixture
def product(db, seller, category):
    return Product.objects.create(
        seller=seller, category=category, name='Куртка',
        slug='jacket-return', price=5000, stock=3, status='active',
    )


@pytest.fixture
def seller2(db):
    return User.objects.create_user(
        username='seller2', email='seller2@test.com', password='x', role='seller',
    )


@pytest.fixture
def product2(db, seller2, category):
    return Product.objects.create(
        seller=seller2, category=category, name='Джинсы',
        slug='jeans-return', price=3000, stock=5, status='active',
    )


def make_delivered_order(buyer, *products_qty, delivered_ago_days=1):
    """Создаёт доставленный заказ с позициями. products_qty - пары (product, qty)."""
    order = Order.objects.create(
        buyer=buyer, delivery_address='Москва', status=Order.STATUS_DELIVERED,
        delivered_at=timezone.now() - timedelta(days=delivered_ago_days),
    )
    items = []
    for product, qty in products_qty:
        items.append(OrderItem.objects.create(
            order=order, product=product, product_name=product.name,
            quantity=qty, price_at_purchase=product.price,
        ))
    return order, items


# ---------- Создание заявки: право, статус, срок ----------

@pytest.mark.django_db
def test_create_return_on_own_delivered_order(auth_client, user, product):
    order, items = make_delivered_order(user, (product, 1))
    resp = auth_client.post('/api/orders/returns/', {
        'order': order.id, 'reason': 'size',
        'items': [{'order_item': items[0].id, 'quantity': 1}],
    }, format='json')
    assert resp.status_code == 201
    assert resp.data['status'] == 'requested'
    assert str(resp.data['refund_amount']) in ('5000.00', '5000')
    assert len(resp.data['items']) == 1


@pytest.mark.django_db
def test_cannot_return_foreign_order(auth_client, seller, product):
    # Заказ другого пользователя - 404 (не свой).
    other = User.objects.create_user(username='o', email='o@t.com', password='x', role='buyer')
    order, items = make_delivered_order(other, (product, 1))
    resp = auth_client.post('/api/orders/returns/', {
        'order': order.id, 'reason': 'size',
        'items': [{'order_item': items[0].id, 'quantity': 1}],
    }, format='json')
    assert resp.status_code == 404


@pytest.mark.django_db
def test_cannot_return_not_delivered(auth_client, user, product):
    order, items = make_delivered_order(user, (product, 1))
    order.status = Order.STATUS_PROCESSING
    order.save()
    resp = auth_client.post('/api/orders/returns/', {
        'order': order.id, 'reason': 'size',
        'items': [{'order_item': items[0].id, 'quantity': 1}],
    }, format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_cannot_return_after_period(auth_client, user, product):
    order, items = make_delivered_order(user, (product, 1), delivered_ago_days=30)
    resp = auth_client.post('/api/orders/returns/', {
        'order': order.id, 'reason': 'size',
        'items': [{'order_item': items[0].id, 'quantity': 1}],
    }, format='json')
    assert resp.status_code == 400
    assert 'срок' in resp.data['error'].lower()


@pytest.mark.django_db
def test_quantity_over_purchased_rejected(auth_client, user, product):
    order, items = make_delivered_order(user, (product, 2))
    resp = auth_client.post('/api/orders/returns/', {
        'order': order.id, 'reason': 'defect',
        'items': [{'order_item': items[0].id, 'quantity': 5}],
    }, format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_duplicate_active_return_rejected(auth_client, user, product):
    order, items = make_delivered_order(user, (product, 1))
    payload = {
        'order': order.id, 'reason': 'size',
        'items': [{'order_item': items[0].id, 'quantity': 1}],
    }
    assert auth_client.post('/api/orders/returns/', payload, format='json').status_code == 201
    resp = auth_client.post('/api/orders/returns/', payload, format='json')
    assert resp.status_code == 409


@pytest.mark.django_db
def test_multivendor_split_rejected(auth_client, user, product, product2):
    # Позиции двух продавцов в одной заявке - нельзя (S4, §4.4).
    order, items = make_delivered_order(user, (product, 1), (product2, 1))
    resp = auth_client.post('/api/orders/returns/', {
        'order': order.id, 'reason': 'size',
        'items': [
            {'order_item': items[0].id, 'quantity': 1},
            {'order_item': items[1].id, 'quantity': 1},
        ],
    }, format='json')
    assert resp.status_code == 400


@pytest.mark.django_db
def test_deleted_product_cannot_create(auth_client, user, product):
    order, items = make_delivered_order(user, (product, 1))
    product.delete()  # OrderItem.product -> NULL (SET_NULL)
    resp = auth_client.post('/api/orders/returns/', {
        'order': order.id, 'reason': 'size',
        'items': [{'order_item': items[0].id, 'quantity': 1}],
    }, format='json')
    assert resp.status_code == 400


# ---------- Список покупателя: без PII продавца ----------

@pytest.mark.django_db
def test_my_returns_no_seller_pii(auth_client, user, product):
    order, items = make_delivered_order(user, (product, 1))
    ReturnRequest.objects.create(order=order, buyer=user, seller=product.seller, reason='size')
    resp = auth_client.get('/api/orders/returns/')
    assert resp.status_code == 200
    body = json.dumps(resp.data, ensure_ascii=False)
    assert product.seller.email not in body


# ---------- Спор: только rejected->disputed ----------

@pytest.mark.django_db
def test_dispute_only_from_rejected(auth_client, user, product):
    order, _ = make_delivered_order(user, (product, 1))
    req = ReturnRequest.objects.create(
        order=order, buyer=user, seller=product.seller, reason='size',
        status=ReturnRequest.STATUS_REQUESTED,
    )
    # Из requested спорить нельзя.
    assert auth_client.post(f'/api/orders/returns/{req.id}/dispute/').status_code == 400
    req.status = ReturnRequest.STATUS_REJECTED
    req.save()
    resp = auth_client.post(f'/api/orders/returns/{req.id}/dispute/')
    assert resp.status_code == 200
    assert resp.data['status'] == 'disputed'


@pytest.mark.django_db
def test_dispute_blocked_after_arbitration(auth_client, user, product):
    order, _ = make_delivered_order(user, (product, 1))
    req = ReturnRequest.objects.create(
        order=order, buyer=user, seller=product.seller, reason='size',
        status=ReturnRequest.STATUS_REJECTED, arbitrated=True,
    )
    resp = auth_client.post(f'/api/orders/returns/{req.id}/dispute/')
    assert resp.status_code == 409


# ---------- Продавец: S4, машина статусов, сток ----------

@pytest.mark.django_db
def test_seller_sees_only_own_returns(seller_client, seller2, user, product, product2):
    o1, _ = make_delivered_order(user, (product, 1))
    o2, _ = make_delivered_order(user, (product2, 1))
    ReturnRequest.objects.create(order=o1, buyer=user, seller=product.seller, reason='size')
    ReturnRequest.objects.create(order=o2, buyer=user, seller=seller2, reason='size')
    resp = seller_client.get('/api/orders/seller/returns/')
    assert resp.status_code == 200
    rows = resp.data['results'] if isinstance(resp.data, dict) else resp.data
    assert len(rows) == 1
    assert rows[0]['status'] == 'requested'


@pytest.mark.django_db
def test_seller_cannot_touch_foreign_return(seller_client, seller2, user, product2):
    order, _ = make_delivered_order(user, (product2, 1))
    req = ReturnRequest.objects.create(order=order, buyer=user, seller=seller2, reason='size')
    resp = seller_client.patch(
        f'/api/orders/seller/returns/{req.id}/', {'status': 'approved'}, format='json'
    )
    assert resp.status_code == 404


@pytest.mark.django_db
def test_invalid_transition_rejected(seller_client, user, product):
    order, _ = make_delivered_order(user, (product, 1))
    req = ReturnRequest.objects.create(
        order=order, buyer=user, seller=product.seller, reason='size',
        status=ReturnRequest.STATUS_REQUESTED,
    )
    # requested -> refunded напрямую нельзя.
    resp = seller_client.patch(
        f'/api/orders/seller/returns/{req.id}/', {'status': 'refunded'}, format='json'
    )
    assert resp.status_code == 400


@pytest.mark.django_db
def test_receive_restores_stock_idempotent(seller_client, user, product):
    order, items = make_delivered_order(user, (product, 2))
    product.stock = 3
    product.save()
    req = ReturnRequest.objects.create(
        order=order, buyer=user, seller=product.seller, reason='size',
        status=ReturnRequest.STATUS_APPROVED,
    )
    ReturnItem.objects.create(return_request=req, order_item=items[0], quantity=2)

    url = f'/api/orders/seller/returns/{req.id}/'
    assert seller_client.patch(url, {'status': 'received'}, format='json').status_code == 200
    product.refresh_from_db()
    assert product.stock == 5  # 3 + 2

    # Повторная приёмка через машину статусов невозможна (received -> received не переход),
    # а прямой повторный receive() не удваивает сток (guard по статусу).
    assert req.receive() is False
    product.refresh_from_db()
    assert product.stock == 5


@pytest.mark.django_db
def test_full_flow_to_refunded(seller_client, user, product):
    order, items = make_delivered_order(user, (product, 1))
    req = ReturnRequest.objects.create(
        order=order, buyer=user, seller=product.seller, reason='size',
        refund_amount=5000,
    )
    ReturnItem.objects.create(return_request=req, order_item=items[0], quantity=1)
    url = f'/api/orders/seller/returns/{req.id}/'
    assert seller_client.patch(url, {'status': 'approved'}, format='json').status_code == 200
    assert seller_client.patch(url, {'status': 'received'}, format='json').status_code == 200
    resp = seller_client.patch(url, {'status': 'refunded'}, format='json')
    assert resp.status_code == 200
    assert resp.data['status'] == 'refunded'


@pytest.mark.django_db
def test_create_return_with_photo(auth_client, user, product):
    # Фото причины (§10.1): multipart - items как JSON-строка, файл как photo.
    import io
    from PIL import Image
    from django.core.files.uploadedfile import SimpleUploadedFile
    buf = io.BytesIO()
    Image.new('RGB', (10, 10), 'red').save(buf, format='PNG')
    photo = SimpleUploadedFile('defect.png', buf.getvalue(), content_type='image/png')

    order, items = make_delivered_order(user, (product, 1))
    resp = auth_client.post('/api/orders/returns/', {
        'order': order.id, 'reason': 'defect', 'method': 'courier',
        'items': json.dumps([{'order_item': items[0].id, 'quantity': 1}]),
        'photo': photo,
    }, format='multipart')
    assert resp.status_code == 201
    assert resp.data['photo']  # фото сохранилось и отдаётся ссылкой


@pytest.mark.django_db
def test_receive_survives_deleted_product(seller_client, user, product):
    order, items = make_delivered_order(user, (product, 1))
    req = ReturnRequest.objects.create(
        order=order, buyer=user, seller=product.seller, reason='size',
        status=ReturnRequest.STATUS_APPROVED,
    )
    ReturnItem.objects.create(return_request=req, order_item=items[0], quantity=1)
    product.delete()  # product=None, восстанавливать сток некуда
    resp = seller_client.patch(
        f'/api/orders/seller/returns/{req.id}/', {'status': 'received'}, format='json'
    )
    assert resp.status_code == 200
    assert resp.data['status'] == 'received'
