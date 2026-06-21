import pytest
from apps.users.models import User, Address

STRONG_PASSWORD = 'Newpass123!'


@pytest.fixture
def other_user(db):
    return User.objects.create_user(
        username='other', email='other@test.com', password='testpass123', role='buyer'
    )


def make_address(client, **overrides):
    payload = {
        'full_name': 'Иван Иванов',
        'phone': '+79991234567',
        'city': 'Москва',
        'street': 'Ленина',
        'house': '1',
    }
    payload.update(overrides)
    return client.post('/api/auth/addresses/', payload, format='json')


# --- Адреса ---

@pytest.mark.django_db
def test_create_address_first_is_default(auth_client):
    r = make_address(auth_client)
    assert r.status_code == 201
    # Первый адрес автоматически становится дефолтным.
    assert Address.objects.get(id=r.data['id']).is_default is True


@pytest.mark.django_db
def test_address_list_only_own(auth_client, other_user):
    make_address(auth_client)
    Address.objects.create(
        user=other_user, full_name='Чужой', phone='+70000000000',
        city='Питер', street='Невский', house='5',
    )
    r = auth_client.get('/api/auth/addresses/')
    assert r.status_code == 200
    rows = r.data['results'] if isinstance(r.data, dict) else r.data
    assert len(rows) == 1
    assert rows[0]['city'] == 'Москва'


@pytest.mark.django_db
def test_cannot_access_foreign_address(auth_client, other_user):
    foreign = Address.objects.create(
        user=other_user, full_name='Чужой', phone='+70000000000',
        city='Питер', street='Невский', house='5',
    )
    r = auth_client.get(f'/api/auth/addresses/{foreign.id}/')
    assert r.status_code == 404


@pytest.mark.django_db
def test_single_default(auth_client):
    make_address(auth_client)
    r2 = make_address(auth_client, city='Казань', is_default=True)
    assert r2.status_code == 201
    defaults = Address.objects.filter(is_default=True)
    assert defaults.count() == 1
    assert defaults.first().city == 'Казань'


@pytest.mark.django_db
def test_delete_default_reassigns(auth_client):
    r1 = make_address(auth_client)
    make_address(auth_client, city='Казань')
    # r1 - дефолтный (первый). Удаляем его -> дефолт переходит на оставшийся.
    auth_client.delete(f"/api/auth/addresses/{r1.data['id']}/")
    assert Address.objects.filter(is_default=True).count() == 1


# --- Смена пароля ---

@pytest.mark.django_db
def test_password_change_success(auth_client, user):
    r = auth_client.post('/api/auth/password-change/', {
        'old_password': 'testpass123',
        'new_password': STRONG_PASSWORD,
        'new_password_confirm': STRONG_PASSWORD,
    }, format='json')
    assert r.status_code == 200
    user.refresh_from_db()
    assert user.check_password(STRONG_PASSWORD)


@pytest.mark.django_db
def test_password_change_wrong_old(auth_client):
    r = auth_client.post('/api/auth/password-change/', {
        'old_password': 'wrongpass',
        'new_password': STRONG_PASSWORD,
        'new_password_confirm': STRONG_PASSWORD,
    }, format='json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_password_change_weak_new(auth_client):
    r = auth_client.post('/api/auth/password-change/', {
        'old_password': 'testpass123',
        'new_password': 'weak',
        'new_password_confirm': 'weak',
    }, format='json')
    assert r.status_code == 400


# --- Параметры фигуры / уведомления ---

@pytest.mark.django_db
def test_body_params_saved(auth_client, user):
    r = auth_client.patch('/api/auth/profile/', {
        'body_params': {'height': 180, 'clothing_size': 'M'},
    }, format='json')
    assert r.status_code == 200
    user.refresh_from_db()
    assert user.body_params['height'] == 180


@pytest.mark.django_db
def test_body_params_reject_out_of_range(auth_client):
    r = auth_client.patch('/api/auth/profile/', {
        'body_params': {'height': 5},
    }, format='json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_body_params_reject_non_numeric(auth_client):
    r = auth_client.patch('/api/auth/profile/', {
        'body_params': {'height': 'высокий'},
    }, format='json')
    assert r.status_code == 400


@pytest.mark.django_db
def test_notification_prefs_reject_unknown_key(auth_client):
    r = auth_client.patch('/api/auth/profile/', {
        'notification_prefs': {'unknown_key': True},
    }, format='json')
    assert r.status_code == 400
