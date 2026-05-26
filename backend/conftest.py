import pytest
from rest_framework.test import APIClient
from apps.users.models import User


@pytest.fixture
def api_client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        username='testuser',
        email='test@test.com',
        password='testpass123',
        role='buyer'
    )


@pytest.fixture
def seller(db):
    return User.objects.create_user(
        username='testseller',
        email='seller@test.com',
        password='testpass123',
        role='seller'
    )


@pytest.fixture
def auth_client(api_client, user):
    api_client.force_authenticate(user=user)
    return api_client


@pytest.fixture
def seller_client(api_client, seller):
    api_client.force_authenticate(user=seller)
    return api_client