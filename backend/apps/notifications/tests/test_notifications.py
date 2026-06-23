import pytest

from apps.notifications import channels
from apps.notifications.models import Broadcast, Notification
from apps.notifications.services import make_unsubscribe_token, notify
from apps.notifications.tasks import run_broadcast
from apps.notifications.templates_registry import render
from apps.users.models import User


@pytest.fixture
def capture_email(monkeypatch):
    """Перехватываем каналы: e-mail пишем в список, WS/SMS глушим - тесты
    гермечны (без Kafka/Resend), при этом видим, какое письмо и кому ушло."""
    sent = []
    monkeypatch.setattr(channels, 'deliver_onsite_live', lambda n: None)
    monkeypatch.setattr(channels, 'deliver_sms_push_stub', lambda u, n: None)
    monkeypatch.setattr(
        channels, 'send_email',
        lambda user, subject, html: sent.append({'to': user.email, 'subject': subject, 'html': html}),
    )
    return sent


# --- Этап 1: ядро и реестр шаблонов ---

@pytest.mark.django_db
def test_notify_creates_feed_row(user):
    n = notify(user, 'order.shipped', {'order_id': 7}, category='order')
    assert Notification.objects.filter(pk=n.pk, recipient=user).exists()
    assert n.title == 'Заказ #7: отправлен'
    assert n.link == '/profile?tab=orders'
    assert n.category == 'order'


def test_render_escapes_ugc():
    # UGC (текст рассылки) в e-mail-HTML экранируется - XSS не исполняется (§8).
    content = render('broadcast', {'title': 'Акция', 'body': '<script>alert(1)</script>'})
    assert '<script>' not in content.email_html
    assert '&lt;script&gt;' in content.email_html


def test_render_unknown_event_safe_default():
    # Опечатка ключа не роняет рендер: нейтральный дефолт, категория marketing.
    content = render('totally.unknown', {})
    assert content.title == 'Новое уведомление'
    assert content.category == Notification.CATEGORY_MARKETING


# --- Этап 3: транзакц./маркетинг и отписка ---

@pytest.mark.django_db
def test_marketing_respects_optout(user, capture_email, django_capture_on_commit_callbacks):
    user.notification_prefs = {'promos_email': False}
    user.save()
    with django_capture_on_commit_callbacks(execute=True):
        notify(user, 'broadcast', {'title': 'A', 'body': 'B'}, category='marketing')
    assert capture_email == []  # отписавшийся не получает маркетинг по e-mail

    user.notification_prefs = {'promos_email': True}
    user.save()
    with django_capture_on_commit_callbacks(execute=True):
        notify(user, 'broadcast', {'title': 'A', 'body': 'B'}, category='marketing')
    assert len(capture_email) == 1
    assert capture_email[0]['to'] == user.email  # письмо на свой адрес, не из запроса


@pytest.mark.django_db
def test_transactional_email_always(user, capture_email, django_capture_on_commit_callbacks):
    # Даже при «выключенных» заказах транзакционное письмо уходит (нельзя не узнать
    # статус своего заказа).
    user.notification_prefs = {'orders_email': False}
    user.save()
    with django_capture_on_commit_callbacks(execute=True):
        notify(user, 'order.shipped', {'order_id': 1}, category='order')
    assert len(capture_email) == 1


@pytest.mark.django_db
def test_unsubscribe_valid_token(api_client, user):
    user.notification_prefs = {'promos_email': True, 'promos_push': True}
    user.save()
    token = make_unsubscribe_token(user)
    res = api_client.get(f'/api/notifications/unsubscribe/{token}/')
    assert res.status_code == 200
    user.refresh_from_db()
    assert user.notification_prefs['promos_email'] is False
    assert user.notification_prefs['promos_push'] is False


@pytest.mark.django_db
def test_unsubscribe_forged_token(api_client):
    res = api_client.get('/api/notifications/unsubscribe/not-a-valid-token/')
    assert res.status_code == 400


# --- Этап 2: feed API и изоляция получателя (§8) ---

@pytest.mark.django_db
def test_feed_isolation(auth_client, user):
    other = User.objects.create_user(username='other', email='other@test.com', password='x')
    Notification.objects.create(recipient=other, event_type='x', title='чужое')
    mine = Notification.objects.create(recipient=user, event_type='y', title='моё')

    res = auth_client.get('/api/notifications/')
    ids = [n['id'] for n in res.data['results']]
    assert ids == [mine.id]  # только своё, чужого нет


@pytest.mark.django_db
def test_mark_read_foreign_is_404(auth_client):
    other = User.objects.create_user(username='other2', email='other2@test.com', password='x')
    n = Notification.objects.create(recipient=other, event_type='x', title='чужое')
    res = auth_client.post(f'/api/notifications/{n.id}/read/')
    assert res.status_code == 404
    n.refresh_from_db()
    assert n.is_read is False  # чужое не помечено


@pytest.mark.django_db
def test_unread_count_and_mark_all(auth_client, user):
    Notification.objects.create(recipient=user, event_type='x', title='a')
    Notification.objects.create(recipient=user, event_type='x', title='b')
    assert auth_client.get('/api/notifications/unread-count/').data['count'] == 2
    auth_client.post('/api/notifications/read-all/')
    assert auth_client.get('/api/notifications/unread-count/').data['count'] == 0


# --- Этап 4: заказ end-to-end через центр (одно письмо, без дубля) ---

@pytest.mark.django_db
def test_order_create_goes_through_center(auth_client, seller, capture_email,
                                          django_capture_on_commit_callbacks):
    from apps.products.models import Category, Product
    category = Category.objects.create(name='Одежда', slug='clothes-notif')
    product = Product.objects.create(
        seller=seller, category=category, name='Куртка', slug='jacket-notif',
        price=1000, stock=5, status='active',
    )
    with django_capture_on_commit_callbacks(execute=True):
        res = auth_client.post('/api/orders/', {
            'delivery_address': 'Москва',
            'items': [{'product': product.id, 'quantity': 1}],
        }, format='json')
    assert res.status_code == 201
    notes = Notification.objects.filter(recipient__email='test@test.com', category='order')
    assert notes.count() == 1            # лента: одно уведомление о заказе
    assert len(capture_email) == 1       # одно письмо, не два (дедуп: центр - одна точка)


# --- Этап 5: рассылка уважает отписку и сегмент ---

@pytest.mark.django_db
def test_broadcast_respects_optout(user, seller, capture_email,
                                   django_capture_on_commit_callbacks):
    # user (buyer) подписан, seller - нет; рассылка по всем.
    user.notification_prefs = {'promos_email': True}
    user.save()
    seller.notification_prefs = {'promos_email': False}
    seller.save()
    broadcast = Broadcast.objects.create(segment=Broadcast.SEGMENT_ALL, title='Распродажа', body='Скидки')

    with django_capture_on_commit_callbacks(execute=True):
        run_broadcast(broadcast.id)

    # On-site лента создаётся обоим (in-app запись); e-mail - только подписавшемуся.
    assert Notification.objects.filter(category='marketing').count() == 2
    recipients = {e['to'] for e in capture_email}
    assert user.email in recipients
    assert seller.email not in recipients
    broadcast.refresh_from_db()
    assert broadcast.sent_at is not None


@pytest.mark.django_db
def test_broadcast_segment_filters_role(user, seller, capture_email,
                                        django_capture_on_commit_callbacks):
    user.notification_prefs = {'promos_email': True}
    user.save()
    seller.notification_prefs = {'promos_email': True}
    seller.save()
    broadcast = Broadcast.objects.create(segment=Broadcast.SEGMENT_SELLERS, title='T', body='B')

    with django_capture_on_commit_callbacks(execute=True):
        run_broadcast(broadcast.id)

    # Только продавцы в сегменте: покупатель уведомление не получает.
    assert Notification.objects.filter(recipient=seller).count() == 1
    assert Notification.objects.filter(recipient=user).count() == 0
