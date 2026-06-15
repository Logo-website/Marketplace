import pytest
from django.core.cache import cache
from apps.users.models import OTPCode, MAX_OTP_ATTEMPTS

# Пароль, проходящий единую парольную политику (длина, заглавная, цифра, спецсимвол)
STRONG_PASSWORD = 'Newpass123!'


@pytest.fixture(autouse=True)
def clear_throttle_cache():
    # Троттлинг держит счётчики в кэше - чистим между тестами, иначе лимиты текут
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def no_email(monkeypatch):
    # Не дёргаем Resend в тестах
    monkeypatch.setattr('apps.users.views.send_otp_email', lambda *a, **k: None)


def latest_code(email):
    otp = OTPCode.objects.filter(email=email).order_by('-created_at').first()
    return otp.code if otp else None


# --- Регистрация ---

@pytest.mark.django_db
def test_register_flow(api_client):
    email = 'new@test.com'
    r1 = api_client.post('/api/auth/register/', {
        'email': email, 'username': 'newuser', 'password': STRONG_PASSWORD,
    })
    assert r1.status_code == 200
    r2 = api_client.post('/api/auth/register/verify/', {
        'email': email, 'code': latest_code(email),
    })
    assert r2.status_code == 201
    assert 'access' in r2.data and 'refresh' in r2.data


@pytest.mark.django_db
def test_register_password_not_stored_plaintext(api_client):
    # S1: в OTPCode.data лежит хеш, а не сырой пароль
    email = 'hash@test.com'
    api_client.post('/api/auth/register/', {
        'email': email, 'username': 'hashuser', 'password': STRONG_PASSWORD,
    })
    otp = OTPCode.objects.filter(email=email).first()
    assert otp.data['password'] != STRONG_PASSWORD
    assert otp.data['password'].startswith('pbkdf2_')


@pytest.mark.django_db
def test_register_weak_password_rejected(api_client):
    # S6: единая политика отклоняет слабый пароль (нет спецсимвола/заглавной)
    r = api_client.post('/api/auth/register/', {
        'email': 'weak@test.com', 'username': 'weak', 'password': 'password',
    })
    assert r.status_code == 400


# --- Вход ---

@pytest.mark.django_db
def test_login_flow(api_client, user):
    r1 = api_client.post('/api/auth/login/', {
        'email': 'test@test.com', 'password': 'testpass123',
    })
    assert r1.status_code == 200
    r2 = api_client.post('/api/auth/login/verify/', {
        'email': 'test@test.com', 'code': latest_code('test@test.com'),
    })
    assert r2.status_code == 200
    assert 'access' in r2.data and 'refresh' in r2.data


@pytest.mark.django_db
def test_login_wrong_password(api_client, user):
    r = api_client.post('/api/auth/login/', {
        'email': 'test@test.com', 'password': 'wrong',
    })
    assert r.status_code == 400


# --- Безопасность OTP ---

@pytest.mark.django_db
def test_otp_lockout_after_max_attempts(api_client, user):
    # S3: после MAX_OTP_ATTEMPTS неверных кодов код инвалидируется
    email = 'test@test.com'
    api_client.post('/api/auth/login/', {'email': email, 'password': 'testpass123'})
    # Ровно MAX попыток укладываются в лимит троттла verify (5/мин);
    # 5-я неверная попытка инвалидирует код (attempts >= MAX)
    for _ in range(MAX_OTP_ATTEMPTS):
        r = api_client.post('/api/auth/login/verify/', {'email': email, 'code': '000000'})
        assert r.status_code == 400
    otp = OTPCode.objects.filter(email=email).first()
    assert otp.is_used is True


@pytest.mark.django_db
def test_otp_single_use(api_client, user):
    # S10: код нельзя использовать дважды
    email = 'test@test.com'
    api_client.post('/api/auth/login/', {'email': email, 'password': 'testpass123'})
    code = latest_code(email)
    r1 = api_client.post('/api/auth/login/verify/', {'email': email, 'code': code})
    assert r1.status_code == 200
    r2 = api_client.post('/api/auth/login/verify/', {'email': email, 'code': code})
    assert r2.status_code == 400


# --- Профиль ---

@pytest.mark.django_db
def test_profile(auth_client):
    response = auth_client.get('/api/auth/profile/')
    assert response.status_code == 200
    assert response.data['email'] == 'test@test.com'


@pytest.mark.django_db
def test_profile_unauthorized(api_client):
    response = api_client.get('/api/auth/profile/')
    assert response.status_code == 401
