import pytest
from datetime import date

from apps.legal.models import LegalDocument, Receipt
from apps.legal.services import generate_receipt
from apps.orders.models import Order
from apps.products.models import Category, Product
from apps.cart.cart import clear_cart


@pytest.fixture
def product(db, seller):
    category = Category.objects.create(name='Одежда', slug='clothes-legal')
    return Product.objects.create(
        seller=seller, category=category, name='Товар для чека',
        slug='product-legal', price=1000, stock=10, status='active',
    )


@pytest.fixture
def _clean_buyer_cart(user):
    clear_cart(user.id)
    yield
    clear_cart(user.id)


# --- Публичный доступ к документам (Этап 1) ---

@pytest.mark.django_db
def test_seeded_documents_published(api_client):
    # data-миграция засеяла 5 опубликованных документов.
    r = api_client.get('/api/legal/documents/')
    assert r.status_code == 200
    slugs = {d['slug'] for d in r.data}
    assert {'oferta', 'privacy', 'delivery-returns', 'about', 'contacts'} <= slugs


@pytest.mark.django_db
def test_published_document_public_for_guest(api_client):
    # Гость (без авторизации) открывает опубликованный документ по slug.
    r = api_client.get('/api/legal/documents/oferta/')
    assert r.status_code == 200
    assert r.data['slug'] == 'oferta'
    assert r.data['version']
    assert r.data['effective_date']


@pytest.mark.django_db
def test_unknown_slug_404(api_client):
    r = api_client.get('/api/legal/documents/nonsense/')
    assert r.status_code == 404


@pytest.mark.django_db
def test_draft_document_hidden(api_client):
    # Черновик (is_published=False) не виден в публичной выдаче -> 404.
    LegalDocument.objects.create(
        slug='draft-doc', title='Черновик', body='secret',
        effective_date=date(2026, 1, 1), is_published=False,
    )
    r = api_client.get('/api/legal/documents/draft-doc/')
    assert r.status_code == 404
    # И не попадает в список.
    lst = api_client.get('/api/legal/documents/')
    assert 'draft-doc' not in {d['slug'] for d in lst.data}


@pytest.mark.django_db
def test_serializer_hides_internal_fields(api_client):
    # Служебное is_published не отдаётся наружу (§8).
    r = api_client.get('/api/legal/documents/oferta/')
    assert 'is_published' not in r.data


@pytest.mark.django_db
def test_body_special_chars_rendered_as_data(api_client):
    # Спецсимволы/разметка в body отдаются как данные, без падения (рендер как
    # текст - забота фронта, §8). Сервер не исполняет и не экранирует молча.
    LegalDocument.objects.create(
        slug='xss-doc', title='<b>x</b>', body='<script>alert(1)</script> & <>',
        effective_date=date(2026, 1, 1), is_published=True,
    )
    r = api_client.get('/api/legal/documents/xss-doc/')
    assert r.status_code == 200
    assert r.data['body'] == '<script>alert(1)</script> & <>'


# --- Чек 54-ФЗ (Этап 3) ---

@pytest.fixture
def _order(user):
    return Order.objects.create(buyer=user, total_price=1500, delivery_address='Москва')


@pytest.mark.django_db
def test_generate_receipt_idempotent(_order):
    # Один заказ - один чек; повторный вызов не плодит дубль (OneToOne + get_or_create).
    r1, created1 = generate_receipt(_order)
    r2, created2 = generate_receipt(_order)
    assert created1 is True
    assert created2 is False
    assert r1.pk == r2.pk
    assert Receipt.objects.filter(order=_order).count() == 1
    assert r1.is_emulated is True


@pytest.mark.django_db
def test_order_from_cart_creates_receipt(auth_client, user, product, _clean_buyer_cart):
    from apps.cart.cart import add_to_cart
    add_to_cart(user.id, product.id, 1)
    r = auth_client.post('/api/orders/from-cart/', {
        'delivery_address': 'Москва', 'accept_offer': True,
    }, format='json')
    assert r.status_code == 201
    # Чек выдан и виден владельцу прямо в ответе (экран «спасибо»).
    assert r.data['receipt'] is not None
    assert r.data['receipt']['is_emulated'] is True
    order = Order.objects.get(buyer=user)
    assert Receipt.objects.filter(order=order).count() == 1


@pytest.mark.django_db
def test_receipt_visible_to_owner_only(auth_client, user, _order):
    # Чек владельца виден в его заказе.
    generate_receipt(_order)
    mine = auth_client.get(f'/api/orders/{_order.id}/')
    assert mine.status_code == 200
    assert mine.data['receipt'] is not None

    # Другой пользователь не видит чужой заказ (а значит и чужой чек) -> 404.
    from apps.users.models import User
    from rest_framework.test import APIClient
    other = User.objects.create_user(username='other', email='other@test.com', password='x', role='buyer')
    other_client = APIClient()
    other_client.force_authenticate(user=other)
    foreign = other_client.get(f'/api/orders/{_order.id}/')
    assert foreign.status_code == 404


# --- Guard согласия с офертой на оформлении (§4.6) ---

@pytest.mark.django_db
def test_order_from_cart_requires_consent(auth_client, user, product, _clean_buyer_cart):
    from apps.cart.cart import add_to_cart
    add_to_cart(user.id, product.id, 1)
    # Без accept_offer заказ не создаётся (дословный критерий карты).
    r = auth_client.post('/api/orders/from-cart/', {'delivery_address': 'Москва'}, format='json')
    assert r.status_code == 400
    assert not Order.objects.filter(buyer=user).exists()
