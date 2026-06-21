import io
import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework import serializers
from apps.users.models import User, SellerProfile
from apps.users.validators import validate_inn, is_onboarding_complete


def _png_bytes():
    """Минимальный валидный PNG (1x1) для проверки загрузки логотипа."""
    from PIL import Image
    buf = io.BytesIO()
    Image.new('RGB', (1, 1)).save(buf, format='PNG')
    return buf.getvalue()

# Валидные ИНН (проходят контрольную цифру ФНС): 12 цифр - физлицо
# (самозанятый/ИП), 10 цифр - ООО. Используем как эталон формата.
VALID_INN_12 = '500100732259'
VALID_INN_10 = '7707083893'


def full_payload(**overrides):
    """Полный комплект для активации: юр-данные + реквизиты + оферта."""
    payload = {
        'legal_status': 'self_employed',
        'legal_name': 'Иванов Иван Иванович',
        'inn': VALID_INN_12,
        'bank_account': '40802810000000000001',
        'bank_bik': '044525225',
        'shop_name': 'Моя витрина',
        'offer_accepted': True,
    }
    payload.update(overrides)
    return payload


# --- Юнит-тесты валидатора (без БД) ---

def test_validate_inn_accepts_valid():
    assert validate_inn(VALID_INN_12, 'self_employed') == VALID_INN_12
    assert validate_inn(VALID_INN_12, 'ip') == VALID_INN_12
    assert validate_inn(VALID_INN_10, 'ooo') == VALID_INN_10


@pytest.mark.parametrize('inn,status', [
    ('1234567890123', 'self_employed'),  # неверная контрольная цифра, 13 цифр
    (VALID_INN_10, 'ip'),                # 10 цифр там, где нужно 12
    (VALID_INN_12, 'ooo'),               # 12 цифр там, где нужно 10
    ('abc', 'ooo'),                      # не цифры
    ('', 'ooo'),                         # пусто
])
def test_validate_inn_rejects_invalid(inn, status):
    with pytest.raises(serializers.ValidationError):
        validate_inn(inn, status)


def test_is_onboarding_complete():
    full = {
        'legal_status': 'ip', 'legal_name': 'Имя', 'inn': VALID_INN_12,
        'bank_account': '408', 'bank_bik': '044', 'offer_accepted': True,
    }
    assert is_onboarding_complete(full) is True
    # Нет оферты - не комплект.
    assert is_onboarding_complete({**full, 'offer_accepted': False}) is False
    # Пустой реквизит - не комплект.
    assert is_onboarding_complete({**full, 'bank_account': ''}) is False


@pytest.fixture
def admin_user(db):
    return User.objects.create_user(
        username='adm', email='adm@test.com', password='testpass123', role='admin'
    )


# --- Активация: полный комплект ---

@pytest.mark.django_db
def test_full_onboarding_activates_and_flips_role(auth_client, user):
    r = auth_client.post('/api/auth/seller/onboarding/', full_payload(), format='json')
    assert r.status_code == 200
    assert r.data['status'] == 'active'
    user.refresh_from_db()
    assert user.role == 'seller'
    # Название витрины ушло на User.shop_name (кросс-модельная запись).
    assert user.shop_name == 'Моя витрина'
    profile = SellerProfile.objects.get(user=user)
    assert profile.offer_accepted_at is not None


# --- Неполная заявка: черновик, роль не меняется ---

@pytest.mark.django_db
def test_incomplete_onboarding_saves_draft_keeps_role(auth_client, user):
    # Оферта не принята + нет реквизитов - валидно по формату, но не комплект.
    r = auth_client.post('/api/auth/seller/onboarding/', {
        'legal_status': 'self_employed',
        'legal_name': 'Иванов Иван',
    }, format='json')
    assert r.status_code == 200
    assert r.data['status'] == 'incomplete'
    user.refresh_from_db()
    assert user.role == 'buyer'
    # Черновик сохранён - данные не вводить заново.
    profile = SellerProfile.objects.get(user=user)
    assert profile.legal_name == 'Иванов Иван'


@pytest.mark.django_db
def test_offer_not_accepted_does_not_activate(auth_client, user):
    r = auth_client.post('/api/auth/seller/onboarding/',
                         full_payload(offer_accepted=False), format='json')
    assert r.status_code == 200
    assert r.data['status'] == 'incomplete'
    user.refresh_from_db()
    assert user.role == 'buyer'


# --- Невалидный ИНН: 400, ничего не пишем ---

@pytest.mark.django_db
def test_invalid_inn_returns_400_and_writes_nothing(auth_client, user):
    r = auth_client.post('/api/auth/seller/onboarding/',
                         full_payload(inn='1234567890123'), format='json')
    assert r.status_code == 400
    assert 'inn' in r.data
    user.refresh_from_db()
    assert user.role == 'buyer'
    assert not SellerProfile.objects.filter(user=user).exists()


@pytest.mark.django_db
def test_inn_length_validated_by_status(auth_client, user):
    # 10-значный ИНН ООО для самозанятого (ждём 12) - ошибка формата.
    r = auth_client.post('/api/auth/seller/onboarding/',
                         full_payload(legal_status='self_employed', inn=VALID_INN_10),
                         format='json')
    assert r.status_code == 400
    assert 'inn' in r.data


@pytest.mark.django_db
def test_ooo_uses_10_digit_inn(auth_client, user):
    r = auth_client.post('/api/auth/seller/onboarding/',
                         full_payload(legal_status='ooo', inn=VALID_INN_10,
                                      legal_name='ООО Ромашка'), format='json')
    assert r.status_code == 200
    assert r.data['status'] == 'active'


# --- Флип роли только из buyer ---

@pytest.mark.django_db
def test_admin_onboarding_does_not_become_seller(api_client, admin_user):
    api_client.force_authenticate(user=admin_user)
    r = api_client.post('/api/auth/seller/onboarding/', full_payload(), format='json')
    assert r.status_code == 200
    admin_user.refresh_from_db()
    # Роль admin не затирается активацией - синхронизация is_staff цела.
    assert admin_user.role == 'admin'
    assert admin_user.is_staff is True


# --- Идемпотентность повторного POST ---

@pytest.mark.django_db
def test_repeat_onboarding_is_idempotent(auth_client, user):
    auth_client.post('/api/auth/seller/onboarding/', full_payload(), format='json')
    r = auth_client.post('/api/auth/seller/onboarding/', full_payload(), format='json')
    assert r.status_code == 200
    assert r.data['status'] == 'active'
    user.refresh_from_db()
    assert user.role == 'seller'
    # OneToOne - дубля профиля нет.
    assert SellerProfile.objects.filter(user=user).count() == 1


# --- Логотип (multipart) ---

@pytest.mark.django_db
def test_onboarding_with_logo_multipart(auth_client, user, settings, tmp_path):
    # Пишем логотип во временный MEDIA_ROOT - тест не оставляет артефактов в репо.
    settings.MEDIA_ROOT = str(tmp_path)
    logo = SimpleUploadedFile('logo.png', _png_bytes(), content_type='image/png')
    payload = full_payload()
    payload['shop_logo'] = logo
    # offer_accepted в multipart - строкой 'true' (как шлёт фронт).
    payload['offer_accepted'] = 'true'
    r = auth_client.post('/api/auth/seller/onboarding/', payload, format='multipart')
    assert r.status_code == 200
    assert r.data['status'] == 'active'
    profile = SellerProfile.objects.get(user=user)
    assert bool(profile.shop_logo) is True


@pytest.mark.django_db
def test_onboarding_rejects_non_image_logo(auth_client, user):
    bad = SimpleUploadedFile('logo.txt', b'not an image', content_type='text/plain')
    payload = full_payload()
    payload['shop_logo'] = bad
    payload['offer_accepted'] = 'true'
    r = auth_client.post('/api/auth/seller/onboarding/', payload, format='multipart')
    # Невалидный файл - 400, не краш.
    assert r.status_code == 400
    assert 'shop_logo' in r.data


# --- GET профиля ---

@pytest.mark.django_db
def test_get_profile_404_when_absent_no_draft_created(auth_client, user):
    r = auth_client.get('/api/auth/seller/profile/')
    assert r.status_code == 404
    # GET safe - черновик на чтение не создаётся.
    assert not SellerProfile.objects.filter(user=user).exists()


@pytest.mark.django_db
def test_get_own_profile(auth_client, user):
    auth_client.post('/api/auth/seller/onboarding/', full_payload(), format='json')
    r = auth_client.get('/api/auth/seller/profile/')
    assert r.status_code == 200
    assert r.data['inn'] == VALID_INN_12


# --- PII не утекает ---

@pytest.mark.django_db
def test_requisites_not_in_user_profile(auth_client, user):
    auth_client.post('/api/auth/seller/onboarding/', full_payload(), format='json')
    r = auth_client.get('/api/auth/profile/')
    assert r.status_code == 200
    # Реквизиты не должны попасть в публичный/личный UserSerializer.
    assert 'inn' not in r.data
    assert 'bank_account' not in r.data


@pytest.mark.django_db
def test_anon_cannot_read_seller_profile(api_client):
    r = api_client.get('/api/auth/seller/profile/')
    assert r.status_code in (401, 403)


@pytest.mark.django_db
def test_other_user_cannot_see_foreign_requisites(auth_client, user, seller):
    # У другого пользователя (seller) есть профиль с реквизитами.
    SellerProfile.objects.create(
        user=seller, legal_status='self_employed', legal_name='Чужой',
        inn=VALID_INN_12, bank_account='40802810000000000099',
        bank_bik='044525225', offer_accepted=True, status='active',
    )
    # auth_client (user) видит только свой профиль -> 404, а не чужие реквизиты.
    r = auth_client.get('/api/auth/seller/profile/')
    assert r.status_code == 404


# --- PATCH настроек ---

@pytest.mark.django_db
def test_patch_forbidden_for_non_seller(auth_client, user):
    # Покупатель без активного профиля - PATCH запрещён.
    r = auth_client.patch('/api/auth/seller/profile/', {'shop_description': 'x'}, format='json')
    assert r.status_code in (403, 404)


@pytest.mark.django_db
def test_patch_edits_active_shop(auth_client, user):
    auth_client.post('/api/auth/seller/onboarding/', full_payload(), format='json')
    r = auth_client.patch('/api/auth/seller/profile/',
                          {'shop_description': 'Новое описание', 'tariff': 'advanced'},
                          format='json')
    assert r.status_code == 200
    assert r.data['shop_description'] == 'Новое описание'
    assert r.data['tariff'] == 'advanced'
    # status остаётся active (read-only, не меняется через PATCH).
    assert r.data['status'] == 'active'


@pytest.mark.django_db
def test_patch_cannot_blank_required_field(auth_client, user):
    auth_client.post('/api/auth/seller/onboarding/', full_payload(), format='json')
    r = auth_client.patch('/api/auth/seller/profile/', {'inn': ''}, format='json')
    assert r.status_code == 400
    # ИНН в БД не обнулён.
    profile = SellerProfile.objects.get(user=user)
    assert profile.inn == VALID_INN_12


@pytest.mark.django_db
def test_patch_status_is_read_only(auth_client, user):
    auth_client.post('/api/auth/seller/onboarding/', full_payload(), format='json')
    # Попытка вручную «понизить» статус игнорируется (read-only).
    r = auth_client.patch('/api/auth/seller/profile/', {'status': 'incomplete'}, format='json')
    assert r.status_code == 200
    assert r.data['status'] == 'active'
