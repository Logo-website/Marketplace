"""Ф19. Админ-реестры: роли (закрытие дыры демоушена), блокировка с защитами,
enforcement блокировки. Поверхность - Django-админка (Вариант A плана)."""
import pytest
from django.contrib.admin.sites import AdminSite
from django.contrib.messages.storage.fallback import FallbackStorage
from django.test import RequestFactory
from rest_framework_simplejwt.tokens import RefreshToken

from apps.users.models import User, OTPCode
from apps.users.admin import CustomUserAdmin, block_users, unblock_users


def _admin_request(user):
    """Запрос с messages-storage для прямого вызова admin-action/save_model."""
    req = RequestFactory().post('/admin/')
    req.user = user
    setattr(req, 'session', {})
    setattr(req, '_messages', FallbackStorage(req))
    return req


def _make_user(email, role=User.ROLE_BUYER):
    return User.objects.create_user(
        username=email.split('@')[0], email=email, password='testpass123', role=role
    )


# --- Этап 1: роли (синхронизация привилегий в обе стороны) ---

@pytest.mark.django_db
def test_promote_to_admin_sets_flags():
    u = _make_user('promo@test.com', role=User.ROLE_BUYER)
    assert not u.is_staff and not u.is_superuser
    u.role = User.ROLE_ADMIN
    u.save()
    u.refresh_from_db()
    assert u.is_staff and u.is_superuser


@pytest.mark.django_db
def test_demote_from_admin_clears_flags():
    # Закрытие дыры: понижение роли должно снять суперправа, иначе бывший
    # админ сохраняет полный доступ к /admin/.
    u = _make_user('demo@test.com', role=User.ROLE_ADMIN)
    assert u.is_staff and u.is_superuser
    u.role = User.ROLE_BUYER
    u.save()
    u.refresh_from_db()
    assert not u.is_staff and not u.is_superuser


@pytest.mark.django_db
def test_create_superuser_is_admin():
    # Менеджер держит инвариант is_superuser <-> role==admin: иначе save()
    # тут же снял бы права у суперюзера с role=buyer (createsuperuser сломан).
    su = User.objects.create_superuser(
        username='root', email='root@test.com', password='testpass123'
    )
    assert su.role == User.ROLE_ADMIN
    assert su.is_staff and su.is_superuser


# --- Этап 2: блокировка через actions + защиты ---

@pytest.mark.django_db
def test_block_action_blocks_user():
    victim = _make_user('victim@test.com')
    admin = _make_user('a@test.com', role=User.ROLE_ADMIN)
    ma = CustomUserAdmin(User, AdminSite())
    block_users(ma, _admin_request(admin), User.objects.filter(pk=victim.pk))
    victim.refresh_from_db()
    assert victim.is_active is False


@pytest.mark.django_db
def test_unblock_action_restores_user():
    victim = _make_user('victim@test.com')
    victim.is_active = False
    victim.save()
    admin = _make_user('a@test.com', role=User.ROLE_ADMIN)
    ma = CustomUserAdmin(User, AdminSite())
    unblock_users(ma, _admin_request(admin), User.objects.filter(pk=victim.pk))
    victim.refresh_from_db()
    assert victim.is_active is True


@pytest.mark.django_db
def test_block_self_forbidden():
    admin = _make_user('a@test.com', role=User.ROLE_ADMIN)
    ma = CustomUserAdmin(User, AdminSite())
    block_users(ma, _admin_request(admin), User.objects.filter(pk=admin.pk))
    admin.refresh_from_db()
    assert admin.is_active is True  # сам себя не выключил


@pytest.mark.django_db
def test_block_last_admin_forbidden():
    # Реестр блокирует легаси-суперюзер (is_staff, но role!=admin - возможен до
    # Ф19/прямой правкой БД). Запрет: единственный role=admin не должен пропасть.
    sole_admin = _make_user('only@test.com', role=User.ROLE_ADMIN)
    legacy = _make_user('legacy@test.com', role=User.ROLE_BUYER)
    User.objects.filter(pk=legacy.pk).update(is_staff=True, is_superuser=True)
    legacy.refresh_from_db()
    ma = CustomUserAdmin(User, AdminSite())
    block_users(ma, _admin_request(legacy), User.objects.filter(pk=sole_admin.pk))
    sole_admin.refresh_from_db()
    assert sole_admin.is_active is True  # защита админ-контура сработала


@pytest.mark.django_db
def test_block_admin_allowed_when_other_admin_exists():
    a = _make_user('a@test.com', role=User.ROLE_ADMIN)
    b = _make_user('b@test.com', role=User.ROLE_ADMIN)
    ma = CustomUserAdmin(User, AdminSite())
    block_users(ma, _admin_request(a), User.objects.filter(pk=b.pk))
    b.refresh_from_db()
    assert b.is_active is False  # не последний - блокировка разрешена


# --- Этап 2: те же защиты при правке через форму (save_model) ---

@pytest.mark.django_db
def test_form_self_deactivation_forbidden():
    admin = _make_user('a@test.com', role=User.ROLE_ADMIN)
    ma = CustomUserAdmin(User, AdminSite())
    obj = User.objects.get(pk=admin.pk)
    obj.is_active = False
    ma.save_model(_admin_request(admin), obj, form=None, change=True)
    admin.refresh_from_db()
    assert admin.is_active is True


@pytest.mark.django_db
def test_form_demote_last_admin_forbidden():
    admin = _make_user('a@test.com', role=User.ROLE_ADMIN)
    ma = CustomUserAdmin(User, AdminSite())
    obj = User.objects.get(pk=admin.pk)
    obj.role = User.ROLE_BUYER
    ma.save_model(_admin_request(admin), obj, form=None, change=True)
    admin.refresh_from_db()
    assert admin.role == User.ROLE_ADMIN and admin.is_superuser


@pytest.mark.django_db
def test_form_demote_admin_allowed_when_other_exists():
    a = _make_user('a@test.com', role=User.ROLE_ADMIN)
    b = _make_user('b@test.com', role=User.ROLE_ADMIN)
    ma = CustomUserAdmin(User, AdminSite())
    obj = User.objects.get(pk=b.pk)
    obj.role = User.ROLE_BUYER
    ma.save_model(_admin_request(a), obj, form=None, change=True)
    b.refresh_from_db()
    assert b.role == User.ROLE_BUYER and not b.is_superuser


# --- Этап 2: enforcement блокировки (SimpleJWT проверяет is_active) ---

@pytest.mark.django_db
def test_blocked_user_old_jwt_rejected(api_client):
    user = _make_user('jwt@test.com')
    token = str(RefreshToken.for_user(user).access_token)
    user.is_active = False
    user.save()
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    r = api_client.get('/api/auth/profile/')
    assert r.status_code == 401  # старый токен заблокированного не работает


@pytest.mark.django_db
def test_blocked_user_cannot_request_login(api_client):
    # Шаг 1 входа: authenticate() (ModelBackend) отклоняет неактивного - OTP
    # даже не выдаётся.
    user = _make_user('login@test.com')
    user.is_active = False
    user.save()
    r = api_client.post('/api/auth/login/', {
        'email': 'login@test.com', 'password': 'testpass123',
    })
    assert r.status_code == 400
    assert not OTPCode.objects.filter(email='login@test.com').exists()


@pytest.mark.django_db
def test_blocked_user_cannot_verify_login(api_client):
    # Узкое окно: OTP выдан до блокировки, отправлен после -> 403, токены не выдаём.
    user = _make_user('verify@test.com')
    otp = OTPCode.generate('verify@test.com', {'user_id': user.id})
    user.is_active = False
    user.save()
    r = api_client.post('/api/auth/login/verify/', {
        'email': 'verify@test.com', 'code': otp.code,
    })
    assert r.status_code == 403
    assert 'access' not in r.data


@pytest.mark.django_db
def test_unblock_restores_jwt_access(api_client):
    user = _make_user('jwt2@test.com')
    user.is_active = False
    user.save()
    user.is_active = True
    user.save()
    token = str(RefreshToken.for_user(user).access_token)
    api_client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    r = api_client.get('/api/auth/profile/')
    assert r.status_code == 200
