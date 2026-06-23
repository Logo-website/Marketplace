"""Тесты образов / лукбука (Ф22, узел 1.23).

Покрывают (план §8, §10): лента - только is_published, фильтры source/seller/contains,
без PII источника; карточка - только active-вещи, 404 для черновика/нет id, сумма
комплекта; батч «весь образ в корзину» - частичный успех (skipped), остаток не
превышается, гость 401, регресс одиночного добавления Ф8; источники editorial/brand.
"""
import pytest
from django.core.exceptions import ValidationError
from apps.cart.cart import clear_cart, cart_key
from apps.products.models import Category, Look, LookItem, Product
from apps.users.models import User


@pytest.fixture
def category(db):
    return Category.objects.create(name='Одежда', slug='clothes-f22')


def _seller(username, email, shop_name=''):
    return User.objects.create_user(
        username=username, email=email, password='testpass123',
        role='seller', shop_name=shop_name,
    )


def _product(seller, category, slug, status='active', stock=5, price=1000):
    return Product.objects.create(
        seller=seller, category=category, name=f'Товар {slug}', slug=slug,
        price=price, stock=stock, status=status,
    )


def _look(title='Образ', source='editorial', seller=None, is_published=True):
    return Look.objects.create(
        title=title, source=source, seller=seller, is_published=is_published,
    )


def _add(look, *products):
    for i, p in enumerate(products):
        LookItem.objects.create(look=look, product=p, order=i)


@pytest.fixture(autouse=True)
def _clean_cart(user):
    """Redis не откатывается транзакцией - чистим корзину до/после (как cart/tests)."""
    clear_cart(user.id)
    yield
    clear_cart(user.id)


# === Консистентность источника (clean, Этап 1) ===

@pytest.mark.django_db
def test_brand_look_requires_seller(category):
    """Образ source=brand без продавца не проходит валидацию (clean, §5)."""
    look = Look(title='Бренд без продавца', source='brand', seller=None)
    with pytest.raises(ValidationError):
        look.full_clean()


@pytest.mark.django_db
def test_editorial_look_forbids_seller(seller, category):
    """Редакционный образ с продавцом не проходит валидацию (§5)."""
    look = Look(title='Редакция с продавцом', source='editorial', seller=seller)
    with pytest.raises(ValidationError):
        look.full_clean()


# === Лента образов ===

@pytest.mark.django_db
def test_looks_list_only_published(api_client, seller, category):
    """Лента отдаёт только опубликованные образы; черновик не виден."""
    p = _product(seller, category, 'f22-a')
    pub = _look('Опубликованный', is_published=True)
    _add(pub, p)
    draft = _look('Черновик', is_published=False)
    _add(draft, p)
    r = api_client.get('/api/products/looks/')
    assert r.status_code == 200
    titles = [x['title'] for x in r.data['results']]
    assert titles == ['Опубликованный']


@pytest.mark.django_db
def test_looks_list_counts_and_total_active_only(api_client, seller, category):
    """items_count и сумма комплекта считаются только по active-вещам."""
    p1 = _product(seller, category, 'f22-b1', price=1000)
    p2 = _product(seller, category, 'f22-b2', price=500)
    p_hidden = _product(seller, category, 'f22-b3', status='hidden', price=999)
    look = _look()
    _add(look, p1, p2, p_hidden)
    r = api_client.get('/api/products/looks/')
    row = r.data['results'][0]
    assert row['items_count'] == 2
    assert row['total_price'] == '1500.00'


@pytest.mark.django_db
def test_looks_list_filter_by_source(api_client, seller, category):
    """?source=brand|editorial фильтрует ленту по источнику."""
    p = _product(seller, category, 'f22-c')
    ed = _look('Редакционный', source='editorial')
    _add(ed, p)
    br = _look('Брендовый', source='brand', seller=seller)
    _add(br, p)
    r = api_client.get('/api/products/looks/?source=brand')
    titles = [x['title'] for x in r.data['results']]
    assert titles == ['Брендовый']


@pytest.mark.django_db
def test_looks_list_filter_by_seller(api_client, category):
    """?seller=<id> отдаёт образы конкретного бренда (вход с витрины Ф20)."""
    s1 = _seller('s1', 's1@t.com', shop_name='Марка А')
    s2 = _seller('s2', 's2@t.com', shop_name='Марка Б')
    _add(_look('А-образ', source='brand', seller=s1), _product(s1, category, 'f22-d1'))
    _add(_look('Б-образ', source='brand', seller=s2), _product(s2, category, 'f22-d2'))
    r = api_client.get(f'/api/products/looks/?seller={s1.id}')
    titles = [x['title'] for x in r.data['results']]
    assert titles == ['А-образ']


@pytest.mark.django_db
def test_looks_list_filter_seller_non_numeric_empty(api_client, seller, category):
    """Нечисловой ?seller= -> пустая лента, не 500."""
    _add(_look(), _product(seller, category, 'f22-e'))
    r = api_client.get('/api/products/looks/?seller=abc')
    assert r.status_code == 200
    assert r.data['count'] == 0


@pytest.mark.django_db
def test_looks_list_filter_contains_product(api_client, seller, category):
    """?contains=<product_id> отдаёт образы с этим товаром (вход «собрать образ» Ф4)."""
    target = _product(seller, category, 'f22-f1')
    other = _product(seller, category, 'f22-f2')
    with_target = _look('С целью')
    _add(with_target, target, other)
    without = _look('Без цели')
    _add(without, other)
    r = api_client.get(f'/api/products/looks/?contains={target.id}')
    titles = [x['title'] for x in r.data['results']]
    assert titles == ['С целью']


@pytest.mark.django_db
def test_looks_list_no_pii(api_client, category):
    """В ленте бренд - публичное имя магазина, без email/phone (S17, §8)."""
    s = _seller('brandpii', 'pii@t.com', shop_name='Марка')
    s.phone = '+79990001122'
    s.save(update_fields=['phone'])
    _add(_look('Б', source='brand', seller=s), _product(s, category, 'f22-g'))
    r = api_client.get('/api/products/looks/?source=brand')
    body = str(r.data)
    assert 'Марка' in body
    assert s.email not in body
    assert s.phone not in body


@pytest.mark.django_db
def test_looks_list_source_name_editorial(api_client, seller, category):
    """Редакционный образ показывает лейбл редакции, seller_id=null."""
    _add(_look('Ред', source='editorial'), _product(seller, category, 'f22-h'))
    r = api_client.get('/api/products/looks/')
    row = r.data['results'][0]
    assert row['source_name'] == 'Подборка редакции'
    assert row['seller_id'] is None


# === Карточка образа ===

@pytest.mark.django_db
def test_look_detail_only_active_items(api_client, seller, category):
    """Карточка отдаёт только active-вещи; скрытая вещь не попадает (§8)."""
    p_active = _product(seller, category, 'f22-i1')
    p_hidden = _product(seller, category, 'f22-i2', status='hidden')
    look = _look()
    _add(look, p_active, p_hidden)
    r = api_client.get(f'/api/products/looks/{look.id}/')
    assert r.status_code == 200
    ids = [p['id'] for p in r.data['products']]
    assert ids == [p_active.id]
    assert r.data['total_price'] == '1000.00'


@pytest.mark.django_db
def test_look_detail_unpublished_404(api_client, seller, category):
    """Неопубликованный образ -> 404, не светится."""
    look = _look(is_published=False)
    _add(look, _product(seller, category, 'f22-j'))
    r = api_client.get(f'/api/products/looks/{look.id}/')
    assert r.status_code == 404


@pytest.mark.django_db
def test_look_detail_missing_404(api_client):
    """Несуществующий id -> 404, не 500."""
    r = api_client.get('/api/products/looks/999999/')
    assert r.status_code == 404


@pytest.mark.django_db
def test_look_detail_all_inactive_empty_products(api_client, seller, category):
    """Все вещи неактивны - карточка не падает, products пуст, сумма 0."""
    p = _product(seller, category, 'f22-k', status='hidden')
    look = _look()
    _add(look, p)
    r = api_client.get(f'/api/products/looks/{look.id}/')
    assert r.status_code == 200
    assert r.data['products'] == []
    assert r.data['total_price'] == '0'


@pytest.mark.django_db
def test_look_detail_text_not_escaped_to_html(api_client, seller, category):
    """UGC-текст образа возвращается как данные (фронт рендерит как текст, §8):
    сервер хранит/отдаёт строку как есть, без падения."""
    p = _product(seller, category, 'f22-xss')
    look = Look.objects.create(
        title='<script>alert(1)</script>', description='<b>x</b>',
        source='editorial', is_published=True,
    )
    _add(look, p)
    r = api_client.get(f'/api/products/looks/{look.id}/')
    assert r.status_code == 200
    assert r.data['title'] == '<script>alert(1)</script>'


# === «Весь образ в корзину» (батч поверх Ф8) ===

@pytest.mark.django_db
def test_add_look_to_cart_all(auth_client, user, seller, category):
    """Все активные вещи образа добавляются одним действием."""
    p1 = _product(seller, category, 'f22-l1')
    p2 = _product(seller, category, 'f22-l2')
    look = _look()
    _add(look, p1, p2)
    r = auth_client.post(f'/api/products/looks/{look.id}/add-to-cart/')
    assert r.status_code == 200
    assert set(r.data['added']) == {p1.id, p2.id}
    assert r.data['skipped'] == []
    assert len(r.data['cart']['items']) == 2


@pytest.mark.django_db
def test_add_look_partial_success(auth_client, user, seller, category):
    """Часть вещей нет в наличии - добавляем доступные, остальные в skipped (не 500)."""
    p_ok = _product(seller, category, 'f22-m1', stock=5)
    p_out = _product(seller, category, 'f22-m2', stock=0)
    look = _look()
    _add(look, p_ok, p_out)
    r = auth_client.post(f'/api/products/looks/{look.id}/add-to-cart/')
    assert r.status_code == 200
    assert r.data['added'] == [p_ok.id]
    assert r.data['skipped'] == [{'product_id': p_out.id, 'reason': 'out_of_stock'}]


@pytest.mark.django_db
def test_add_look_inactive_items_excluded(auth_client, user, seller, category):
    """Неактивная вещь образа в добавление не попадает вовсе (ни added, ни skipped)."""
    p_ok = _product(seller, category, 'f22-n1')
    p_hidden = _product(seller, category, 'f22-n2', status='hidden')
    look = _look()
    _add(look, p_ok, p_hidden)
    r = auth_client.post(f'/api/products/looks/{look.id}/add-to-cart/')
    assert r.data['added'] == [p_ok.id]
    assert r.data['skipped'] == []


@pytest.mark.django_db
def test_add_look_repeat_respects_stock(auth_client, user, seller, category):
    """Повторное добавление образа не превышает остаток (идемпотентность Ф8)."""
    p = _product(seller, category, 'f22-o', stock=1)
    look = _look()
    _add(look, p)
    r1 = auth_client.post(f'/api/products/looks/{look.id}/add-to-cart/')
    assert r1.data['added'] == [p.id]
    r2 = auth_client.post(f'/api/products/looks/{look.id}/add-to-cart/')
    # На складе 1, в корзине уже 1 - повтор уходит в skipped, не превышает склад.
    assert r2.data['added'] == []
    assert r2.data['skipped'] == [{'product_id': p.id, 'reason': 'out_of_stock'}]


@pytest.mark.django_db
def test_add_look_guest_401(api_client, seller, category):
    """Гость не может положить образ (батч под IsAuthenticated) -> 401."""
    look = _look()
    _add(look, _product(seller, category, 'f22-p'))
    r = api_client.post(f'/api/products/looks/{look.id}/add-to-cart/')
    assert r.status_code == 401


@pytest.mark.django_db
def test_add_look_unpublished_404(auth_client, seller, category):
    """Добавить неопубликованный образ нельзя -> 404."""
    look = _look(is_published=False)
    _add(look, _product(seller, category, 'f22-q'))
    r = auth_client.post(f'/api/products/looks/{look.id}/add-to-cart/')
    assert r.status_code == 404


# === Регресс Ф8 (общий helper не сломал одиночное добавление) ===

@pytest.mark.django_db
def test_single_add_still_works(auth_client, user, seller, category):
    """Одиночное добавление Ф8 после выноса в helper - без регресса."""
    p = _product(seller, category, 'f22-r', stock=5)
    r = auth_client.post('/api/cart/', {'product_id': p.id, 'quantity': 2}, format='json')
    assert r.status_code == 200
    assert r.data['cart'][cart_key(p.id)] == 2
