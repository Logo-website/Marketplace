import logging
import pytest
from unittest import mock
from kombu.exceptions import OperationalError
from rest_framework_simplejwt.tokens import RefreshToken
from django.core.cache import cache
from apps.users.models import User, Address, OTPCode

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


# --- Email read-only (поток D, стресс-тест 2026-06-24) ---

@pytest.mark.django_db
def test_email_not_editable_via_profile(auth_client, user):
    # PATCH с новым email не меняет email (read_only_fields), ответ 200.
    old_email = user.email
    r = auth_client.patch('/api/auth/profile/', {
        'email': 'Changed@Mail.ru',
    }, format='json')
    assert r.status_code == 200
    user.refresh_from_db()
    assert user.email == old_email


@pytest.mark.django_db
def test_profile_other_fields_still_editable(auth_client, user):
    # Регрессия: остальные поля профиля по-прежнему пишутся.
    r = auth_client.patch('/api/auth/profile/', {
        'phone': '+79990001122',
    }, format='json')
    assert r.status_code == 200
    user.refresh_from_db()
    assert user.phone == '+79990001122'


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


# --- Смена email через OTP (план 2026-06-29, Фаза 2) ---

@pytest.fixture(autouse=True)
def clear_throttle_cache():
    # Троттлы смены email держат счётчики в кэше - чистим между тестами,
    # иначе email_change (3/час) и verify (5/мин) текут из теста в тест.
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def no_email(monkeypatch):
    # OTP-письмо на новый адрес - не дёргаем Resend.
    monkeypatch.setattr('apps.users.views.send_otp_email', lambda *a, **k: None)


@pytest.fixture(autouse=True)
def mock_alert(monkeypatch):
    # Security-алерт старому владельцу уходит через Celery (.delay) - мокаем,
    # чтобы не слать наружу и заодно ассертить R10.
    m = mock.Mock()
    monkeypatch.setattr('apps.users.views.send_notification_email.delay', m)
    return m


def latest_code(email):
    otp = OTPCode.objects.filter(email=email).order_by('-created_at').first()
    return otp.code if otp else None


def request_change(client, new_email, password='testpass123'):
    return client.post('/api/auth/email-change/', {
        'new_email': new_email, 'password': password,
    }, format='json')


def verify_change(client, new_email, code):
    return client.post('/api/auth/email-change/verify/', {
        'new_email': new_email, 'code': code,
    }, format='json')


@pytest.mark.django_db
def test_email_change_full_flow(auth_client, user):
    # Успешный поток: шаг 1 -> шаг 2 -> email обновлён, вход новым адресом находит юзера.
    r1 = request_change(auth_client, 'new@test.com')
    assert r1.status_code == 200
    r2 = verify_change(auth_client, 'new@test.com', latest_code('new@test.com'))
    assert r2.status_code == 200
    user.refresh_from_db()
    assert user.email == 'new@test.com'
    # вход новым email находит пользователя (login делает User.objects.get(email=...))
    assert User.objects.get(email='new@test.com').pk == user.pk


@pytest.mark.django_db
def test_email_change_normalizes_case(auth_client, user):
    # R1: New@Mail.ru нормализуется в lower, вход после смены работает.
    request_change(auth_client, 'New@Mail.ru')
    r = verify_change(auth_client, 'New@Mail.ru', latest_code('new@mail.ru'))
    assert r.status_code == 200
    user.refresh_from_db()
    assert user.email == 'new@mail.ru'
    assert User.objects.filter(email='new@mail.ru').exists()


@pytest.mark.django_db
def test_email_change_same_as_current(auth_client, user):
    # R3: новый == текущий -> 400, в т.ч. свой же адрес в другом регистре.
    r1 = request_change(auth_client, 'test@test.com')
    assert r1.status_code == 400
    r2 = request_change(auth_client, 'Test@Test.com')
    assert r2.status_code == 400


@pytest.mark.django_db
def test_email_change_invalid_format(auth_client):
    # R12: голый APIView, формат проверяет validate_email -> мусор без @ -> 400.
    r = request_change(auth_client, 'notanemail')
    assert r.status_code == 400


@pytest.mark.django_db
def test_email_change_taken_by_other_on_request(auth_client, other_user):
    # R2: занятость регистронезависима - Other@test.com vs other@test.com -> 400 на шаге 1.
    r = request_change(auth_client, 'Other@test.com')
    assert r.status_code == 400


@pytest.mark.django_db
def test_email_change_taken_between_steps(auth_client, user):
    # R2/R4: адрес заняли между шагом 1 и verify -> 400, не 500. Занимаем в ДРУГОМ
    # регистре (Race@) - проверка iexact на verify тоже должна быть регистронезависима.
    request_change(auth_client, 'race@test.com')
    code = latest_code('race@test.com')
    User.objects.create_user(
        username='racer', email='Race@test.com', password='testpass123', role='buyer'
    )
    r = verify_change(auth_client, 'race@test.com', code)
    assert r.status_code == 400


@pytest.mark.django_db
def test_email_change_wrong_password(auth_client):
    # Личность подтверждается паролём - неверный пароль на шаге 1 -> 400.
    r = request_change(auth_client, 'new@test.com', password='wrongpass')
    assert r.status_code == 400


@pytest.mark.django_db
def test_email_change_foreign_user_id(auth_client, user, other_user):
    # R7 (анти-IDOR): код выписан другому user_id -> verify под нашим токеном -> 403.
    OTPCode.generate('foreign@test.com', {
        'action': 'change_email',
        'user_id': other_user.id,
        'new_email': 'foreign@test.com',
    })
    r = verify_change(auth_client, 'foreign@test.com', latest_code('foreign@test.com'))
    assert r.status_code == 403
    user.refresh_from_db()
    assert user.email == 'test@test.com'  # email не изменён
    # L1: 403 по чужому user_id не должен сжигать ожидающий код владельца
    assert OTPCode.objects.get(email='foreign@test.com').is_used is False


@pytest.mark.django_db
def test_email_change_wrong_code(auth_client):
    # R8: неверный код делегируется consume_otp -> 400.
    request_change(auth_client, 'new@test.com')
    r = verify_change(auth_client, 'new@test.com', '000000')
    assert r.status_code == 400


@pytest.mark.django_db
def test_email_change_alerts_old_email(auth_client, user, mock_alert,
                                       django_capture_on_commit_callbacks):
    # R10: на успехе security-алерт уходит на СТАРЫЙ адрес. Алерт теперь ставится
    # в transaction.on_commit (N1/N3) - исполняем колбэки явно через capture.
    request_change(auth_client, 'new@test.com')
    with django_capture_on_commit_callbacks(execute=True):
        r = verify_change(auth_client, 'new@test.com', latest_code('new@test.com'))
    assert r.status_code == 200
    mock_alert.assert_called_once()
    assert mock_alert.call_args.args[0] == 'test@test.com'


# --- Audit fixes (план 2026-06-29-email-change-audit-fixes) ---

@pytest.mark.django_db
def test_email_change_revokes_sessions(auth_client, user):
    # M1: после смены email ранее выданный refresh-токен отозван -> refresh даёт 401.
    refresh = str(RefreshToken.for_user(user))
    request_change(auth_client, 'new@test.com')
    r = verify_change(auth_client, 'new@test.com', latest_code('new@test.com'))
    assert r.status_code == 200
    resp = auth_client.post('/api/auth/token/refresh/', {'refresh': refresh}, format='json')
    assert resp.status_code == 401


@pytest.mark.django_db
def test_password_change_revokes_sessions(auth_client, user):
    # M1: смена пароля тоже отзывает ранее выданные refresh-сессии.
    refresh = str(RefreshToken.for_user(user))
    r = auth_client.post('/api/auth/password-change/', {
        'old_password': 'testpass123',
        'new_password': STRONG_PASSWORD,
        'new_password_confirm': STRONG_PASSWORD,
    }, format='json')
    assert r.status_code == 200
    resp = auth_client.post('/api/auth/token/refresh/', {'refresh': refresh}, format='json')
    assert resp.status_code == 401


@pytest.mark.django_db
def test_email_change_throttled(auth_client, user):
    # R5/R6: email_change = 3/час. clear_throttle_cache (autouse) чистит кэш МЕЖДУ
    # тестами; внутри теста счётчик копится -> 4-й запрос подряд -> 429. Шлём с
    # неверным паролем: троттл считает все запросы (отрабатывает до тела вью), а
    # неверный пароль не плодит OTP и писем.
    for _ in range(3):
        r = request_change(auth_client, 'spam@test.com', password='wrongpass')
        assert r.status_code != 429
    r = request_change(auth_client, 'spam@test.com', password='wrongpass')
    assert r.status_code == 429


@pytest.mark.django_db
def test_email_change_empty_fields(auth_client):
    # R11: пустой new_email и/или password -> 400 (no_email autouse не даёт дёрнуть Resend).
    r1 = auth_client.post('/api/auth/email-change/',
                          {'new_email': '', 'password': 'x'}, format='json')
    assert r1.status_code == 400
    r2 = auth_client.post('/api/auth/email-change/',
                          {'new_email': 'a@b.com', 'password': ''}, format='json')
    assert r2.status_code == 400


@pytest.mark.django_db
def test_email_change_too_long(auth_client):
    # N2: формат-валидный, но длиннее колонки email (varchar 254) адрес -> 400,
    # без обращения к БД/Resend (падал бы 500 на OTPCode.generate/User.save).
    long_email = 'a' * 250 + '@test.com'  # len 259 > 254
    r = request_change(auth_client, long_email)
    assert r.status_code == 400


@pytest.mark.django_db
def test_email_change_alert_broker_down(auth_client, user, monkeypatch, caplog,
                                        django_capture_on_commit_callbacks):
    # N1: брокер недоступен -> .delay кидает OperationalError. Смена уже сохранена,
    # эндпоинт обязан вернуть 200, email сменён, ошибка - в лог (best-effort алерт).
    def boom(*a, **k):
        raise OperationalError('broker down')
    monkeypatch.setattr('apps.users.views.send_notification_email.delay', boom)
    request_change(auth_client, 'new@test.com')
    with caplog.at_level(logging.ERROR), django_capture_on_commit_callbacks(execute=True):
        r = verify_change(auth_client, 'new@test.com', latest_code('new@test.com'))
    assert r.status_code == 200
    user.refresh_from_db()
    assert user.email == 'new@test.com'
    assert any('alert enqueue failed' in m for m in caplog.messages)
