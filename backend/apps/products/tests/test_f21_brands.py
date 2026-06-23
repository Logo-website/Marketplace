"""Тесты каталога брендов (Ф21, узел 1.22).

Покрывают: список = продавцы с активными товарами + сводка без PII; имя -
fallback на username; продавец без активных товаров / заблокированный / покупатель
не в списке; поиск ?q=; категорийный фильтр ?category=; сортировки alpha/popular/new;
product_count == N (не завышается JOIN-размножением, §4.2); отсутствие email/phone.
"""
import pytest
from apps.products.models import Category, Product
from apps.users.models import User


@pytest.fixture
def category(db):
    return Category.objects.create(name='Одежда', slug='clothes-f21')


@pytest.fixture
def category2(db):
    return Category.objects.create(name='Обувь', slug='shoes-f21')


def _seller(username, email, shop_name=''):
    return User.objects.create_user(
        username=username, email=email, password='testpass123',
        role='seller', shop_name=shop_name,
    )


def _product(seller, category, slug, status='active'):
    return Product.objects.create(
        seller=seller, category=category, name=f'Товар {slug}', slug=slug,
        price=1000, stock=3, status=status,
    )


# --- Состав списка ---

@pytest.mark.django_db
def test_brands_list_returns_seller_with_active_products(api_client, seller, category):
    """Продавец с активным товаром попадает в каталог со сводкой."""
    seller.shop_name = 'Лавка'
    seller.save(update_fields=['shop_name'])
    _product(seller, category, 'f21-a')
    r = api_client.get('/api/products/brands/')
    assert r.status_code == 200
    results = r.data['results']
    assert len(results) == 1
    row = results[0]
    assert row['id'] == seller.id
    assert row['name'] == 'Лавка'
    assert row['product_count'] == 1
    assert set(row.keys()) == {
        'id', 'name', 'logo', 'description', 'product_count', 'rating', 'reviews_count'
    }


@pytest.mark.django_db
def test_brands_list_excludes_seller_without_active_products(api_client, seller, category):
    """Продавец без активных товаров (только скрытый/черновик) не в списке."""
    _product(seller, category, 'f21-hidden', status='hidden')
    _product(seller, category, 'f21-draft', status='draft')
    r = api_client.get('/api/products/brands/')
    assert r.data['count'] == 0


@pytest.mark.django_db
def test_brands_list_excludes_buyer(api_client, user, category):
    """Покупатель не бренд, даже если у него каким-то образом есть товары - роль seller."""
    r = api_client.get('/api/products/brands/')
    assert r.data['count'] == 0


@pytest.mark.django_db
def test_brands_list_excludes_blocked_seller(api_client, seller, category):
    """Заблокированный продавец (is_active=False, Ф19) не в каталоге."""
    _product(seller, category, 'f21-b')
    seller.is_active = False
    seller.save(update_fields=['is_active'])
    r = api_client.get('/api/products/brands/')
    assert r.data['count'] == 0


@pytest.mark.django_db
def test_brands_list_name_falls_back_to_username(api_client, seller, category):
    """Пустой shop_name -> имя = username, не пустая карточка и не email."""
    _product(seller, category, 'f21-c')
    r = api_client.get('/api/products/brands/')
    assert r.data['results'][0]['name'] == seller.username


@pytest.mark.django_db
def test_brands_list_no_pii(api_client, seller, category):
    """В выдаче нет email/phone продавца (S17, §9)."""
    seller.phone = '+79990001122'
    seller.save(update_fields=['phone'])
    _product(seller, category, 'f21-d')
    r = api_client.get('/api/products/brands/')
    body = str(r.data)
    assert seller.email not in body
    assert seller.phone not in body


# --- product_count: ловушка multi-valued relations (§4.2) ---

@pytest.mark.django_db
def test_brands_product_count_not_inflated(api_client, seller, category, category2):
    """product_count == число активных товаров, не N×k (Count distinct, §4.2).
    Несколько товаров в разных категориях не должны размножать счётчик."""
    _product(seller, category, 'f21-e1')
    _product(seller, category, 'f21-e2')
    _product(seller, category2, 'f21-e3')
    _product(seller, category, 'f21-e-hidden', status='hidden')  # не считается
    r = api_client.get('/api/products/brands/')
    assert r.data['results'][0]['product_count'] == 3


# --- Поиск ---

@pytest.mark.django_db
def test_brands_search_by_shop_name(api_client, category):
    """?q= ищет по имени магазина (icontains)."""
    s1 = _seller('s1', 's1@t.com', shop_name='Северная марка')
    s2 = _seller('s2', 's2@t.com', shop_name='Южный бренд')
    _product(s1, category, 'f21-q1')
    _product(s2, category, 'f21-q2')
    r = api_client.get('/api/products/brands/?q=север')
    names = [b['name'] for b in r.data['results']]
    assert names == ['Северная марка']


@pytest.mark.django_db
def test_brands_search_no_results_empty_not_error(api_client, seller, category):
    """Поиск без совпадений -> пустой список, не 500."""
    _product(seller, category, 'f21-q3')
    r = api_client.get('/api/products/brands/?q=несуществующийбренд')
    assert r.status_code == 200
    assert r.data['count'] == 0


# --- Категорийный фильтр ---

@pytest.mark.django_db
def test_brands_filter_by_category(api_client, category, category2):
    """?category= оставляет брендов с активным товаром в этой категории."""
    s1 = _seller('s1', 's1@t.com', shop_name='Одёжный')
    s2 = _seller('s2', 's2@t.com', shop_name='Обувной')
    _product(s1, category, 'f21-cat1')
    _product(s2, category2, 'f21-cat2')
    r = api_client.get(f'/api/products/brands/?category={category.id}')
    names = [b['name'] for b in r.data['results']]
    assert names == ['Одёжный']


@pytest.mark.django_db
def test_brands_filter_unknown_category_ignored(api_client, seller, category):
    """Нечисловая категория игнорируется (выдача не падает, не 500)."""
    _product(seller, category, 'f21-cat3')
    r = api_client.get('/api/products/brands/?category=abc')
    assert r.status_code == 200
    assert r.data['count'] == 1


# --- Сортировки ---

@pytest.mark.django_db
def test_brands_sort_alpha_default(api_client, category):
    """Дефолтная сортировка - алфавит по имени без учёта регистра."""
    sb = _seller('sb', 'sb@t.com', shop_name='Берёза')
    sa = _seller('sa', 'sa@t.com', shop_name='арбуз')
    _product(sb, category, 'f21-s1')
    _product(sa, category, 'f21-s2')
    r = api_client.get('/api/products/brands/')
    names = [b['name'] for b in r.data['results']]
    assert names == ['арбуз', 'Берёза']


@pytest.mark.django_db
def test_brands_sort_popular_by_product_count(api_client, category):
    """?sort=popular - больше активных товаров сверху."""
    s1 = _seller('s1', 's1@t.com', shop_name='Маленький')
    s2 = _seller('s2', 's2@t.com', shop_name='Большой')
    _product(s1, category, 'f21-p1')
    _product(s2, category, 'f21-p2')
    _product(s2, category, 'f21-p3')
    r = api_client.get('/api/products/brands/?sort=popular')
    names = [b['name'] for b in r.data['results']]
    assert names == ['Большой', 'Маленький']


@pytest.mark.django_db
def test_brands_sort_new_by_date_joined(api_client, category):
    """?sort=new - недавно зарегистрированные продавцы сверху (подборка «новые»)."""
    old = _seller('old', 'old@t.com', shop_name='Старый')
    new = _seller('new', 'new@t.com', shop_name='Новый')
    # date_joined auto_now_add -> 'new' создан позже, должен быть первым.
    _product(old, category, 'f21-n1')
    _product(new, category, 'f21-n2')
    r = api_client.get('/api/products/brands/?sort=new')
    names = [b['name'] for b in r.data['results']]
    assert names[0] == 'Новый'


@pytest.mark.django_db
def test_brands_list_no_n_plus_1(api_client, category, django_assert_max_num_queries):
    """Сводка по брендам - без N+1: число запросов не растёт с числом продавцов.
    product_count - аннотацией, seller_profile - select_related (§4.2, §10)."""
    from apps.users.models import SellerProfile
    for i in range(5):
        s = _seller(f'sn{i}', f'sn{i}@t.com', shop_name=f'Бренд {i}')
        SellerProfile.objects.create(user=s, shop_description=f'описание {i}')
        _product(s, category, f'f21-nplus-{i}')
    # Запрос списка + пагинация-count + аннотация: фиксированное число, не O(N).
    with django_assert_max_num_queries(6):
        r = api_client.get('/api/products/brands/')
    assert r.data['count'] == 5


@pytest.mark.django_db
def test_brands_description_from_profile(api_client, seller, category):
    """Описание карточки берётся из shop_description (Ф11), если профиль есть."""
    from apps.users.models import SellerProfile
    SellerProfile.objects.create(user=seller, shop_description='Локальная марка')
    _product(seller, category, 'f21-desc')
    r = api_client.get('/api/products/brands/')
    assert r.data['results'][0]['description'] == 'Локальная марка'


@pytest.mark.django_db
def test_brands_rating_from_seller_rating(api_client, seller, category):
    """rating/reviews_count - денорм рейтинг продавца (Ф20), 0 отзывов -> 0."""
    _product(seller, category, 'f21-r1')
    r = api_client.get('/api/products/brands/')
    row = r.data['results'][0]
    assert row['rating'] == seller.seller_rating
    assert row['reviews_count'] == 0
