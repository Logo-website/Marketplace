import pytest


@pytest.mark.django_db
def test_register(api_client):
    response = api_client.post('/api/auth/register/', {
        'email': 'new@test.com',
        'username': 'newuser',
        'password': 'newpass123',
        'role': 'buyer'
    })
    assert response.status_code == 201
    assert response.data['email'] == 'new@test.com'


@pytest.mark.django_db
def test_login(api_client, user):
    response = api_client.post('/api/auth/login/', {
        'email': 'test@test.com',
        'password': 'testpass123'
    })
    assert response.status_code == 200
    assert 'access' in response.data
    assert 'refresh' in response.data


@pytest.mark.django_db
def test_profile(auth_client):
    response = auth_client.get('/api/auth/profile/')
    assert response.status_code == 200
    assert response.data['email'] == 'test@test.com'


@pytest.mark.django_db
def test_profile_unauthorized(api_client):
    response = api_client.get('/api/auth/profile/')
    assert response.status_code == 401