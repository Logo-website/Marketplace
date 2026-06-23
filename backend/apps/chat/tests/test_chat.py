import pytest
from rest_framework.test import APIClient

from apps.chat import bot, delivery
from apps.chat.models import Conversation, Message
from apps.users.models import User


@pytest.fixture(autouse=True)
def mute_delivery(monkeypatch):
    """Глушим живую доставку (Kafka) - тесты гермечны, без брокера. Запись в БД и
    REST-логику это не трогает."""
    from services.kafka_service import KafkaService
    monkeypatch.setattr(KafkaService, 'chat_message', staticmethod(lambda rid, payload: None))


@pytest.fixture
def buyer(db):
    return User.objects.create_user(
        username='buyer1', email='buyer1@test.com', password='pass12345', role='buyer'
    )


@pytest.fixture
def buyer2(db):
    return User.objects.create_user(
        username='buyer2', email='buyer2@test.com', password='pass12345', role='buyer'
    )


@pytest.fixture
def shop(db):
    return User.objects.create_user(
        username='shop1', email='shop1@test.com', password='pass12345',
        role='seller', shop_name='Модный Дом',
    )


def client_for(user):
    c = APIClient()
    c.force_authenticate(user=user)
    return c


# --- Старт диалога: идемпотентность и валидация ---

@pytest.mark.django_db
def test_start_seller_conversation(buyer, shop):
    res = client_for(buyer).post('/api/chat/conversations/', {'kind': 'seller', 'seller': shop.id})
    assert res.status_code == 200
    assert Conversation.objects.filter(buyer=buyer, seller=shop, kind='seller').count() == 1


@pytest.mark.django_db
def test_start_seller_is_idempotent(buyer, shop):
    c = client_for(buyer)
    first = c.post('/api/chat/conversations/', {'kind': 'seller', 'seller': shop.id}).data['id']
    second = c.post('/api/chat/conversations/', {'kind': 'seller', 'seller': shop.id}).data['id']
    assert first == second
    assert Conversation.objects.filter(buyer=buyer, seller=shop).count() == 1


@pytest.mark.django_db
def test_support_is_one_thread_per_buyer(buyer):
    c = client_for(buyer)
    first = c.post('/api/chat/conversations/', {'kind': 'support'}).data['id']
    second = c.post('/api/chat/conversations/', {'kind': 'support'}).data['id']
    assert first == second
    assert Conversation.objects.filter(buyer=buyer, kind='support').count() == 1


@pytest.mark.django_db
def test_cannot_start_chat_with_self(shop):
    # Продавец пишет в свой же магазин -> 400 (§5).
    res = client_for(shop).post('/api/chat/conversations/', {'kind': 'seller', 'seller': shop.id})
    assert res.status_code == 400


@pytest.mark.django_db
def test_start_with_non_seller_is_404(buyer, buyer2):
    res = client_for(buyer).post('/api/chat/conversations/', {'kind': 'seller', 'seller': buyer2.id})
    assert res.status_code == 404


@pytest.mark.django_db
def test_unknown_kind_is_400(buyer):
    res = client_for(buyer).post('/api/chat/conversations/', {'kind': 'wat'})
    assert res.status_code == 400


# --- Анти-IDOR: чтение и запись только участнику ---

@pytest.mark.django_db
def test_outsider_cannot_read_messages(buyer, shop, buyer2):
    conv = Conversation.objects.create(buyer=buyer, seller=shop, kind='seller')
    res = client_for(buyer2).get(f'/api/chat/conversations/{conv.id}/messages/')
    assert res.status_code in (403, 404)


@pytest.mark.django_db
def test_outsider_cannot_post_message(buyer, shop, buyer2):
    conv = Conversation.objects.create(buyer=buyer, seller=shop, kind='seller')
    res = client_for(buyer2).post(
        f'/api/chat/conversations/{conv.id}/messages/', {'body': 'привет'}
    )
    assert res.status_code in (403, 404)
    assert Message.objects.filter(conversation=conv).count() == 0


@pytest.mark.django_db
def test_participant_can_post_and_read(buyer, shop, django_capture_on_commit_callbacks):
    conv = Conversation.objects.create(buyer=buyer, seller=shop, kind='seller')
    with django_capture_on_commit_callbacks(execute=True):
        res = client_for(buyer).post(
            f'/api/chat/conversations/{conv.id}/messages/', {'body': 'Здравствуйте'}
        )
    assert res.status_code == 201
    read = client_for(shop).get(f'/api/chat/conversations/{conv.id}/messages/')
    assert read.status_code == 200
    assert read.data[0]['body'] == 'Здравствуйте'


# --- Валидация тела ---

@pytest.mark.django_db
def test_blank_message_rejected(buyer, shop):
    conv = Conversation.objects.create(buyer=buyer, seller=shop, kind='seller')
    res = client_for(buyer).post(f'/api/chat/conversations/{conv.id}/messages/', {'body': '   '})
    assert res.status_code == 400


@pytest.mark.django_db
def test_xss_body_stored_as_plain_text(buyer, shop, django_capture_on_commit_callbacks):
    conv = Conversation.objects.create(buyer=buyer, seller=shop, kind='seller')
    payload = '<script>alert(1)</script>'
    with django_capture_on_commit_callbacks(execute=True):
        res = client_for(buyer).post(
            f'/api/chat/conversations/{conv.id}/messages/', {'body': payload}
        )
    # Тело хранится как есть (плейн-текст); экранирование - на фронте (JSX) и в e-mail.
    assert res.data['message']['body'] == payload
    assert Message.objects.get(conversation=conv).body == payload


# --- Без PII контрагента ---

@pytest.mark.django_db
def test_conversation_list_has_no_email(buyer, shop):
    Conversation.objects.create(buyer=buyer, seller=shop, kind='seller')
    res = client_for(buyer).get('/api/chat/conversations/')
    body = str(res.data)
    assert shop.email not in body
    assert buyer.email not in body
    # Имя контрагента - shop_name, не email.
    assert res.data[0]['title'] == 'Модный Дом'


# --- Прочитано ---

@pytest.mark.django_db
def test_read_marks_incoming_only(buyer, shop):
    conv = Conversation.objects.create(buyer=buyer, seller=shop, kind='seller')
    mine = Message.objects.create(conversation=conv, sender=buyer, body='от меня')
    incoming = Message.objects.create(conversation=conv, sender=shop, body='ответ')
    client_for(buyer).post(f'/api/chat/conversations/{conv.id}/read/')
    mine.refresh_from_db()
    incoming.refresh_from_db()
    assert mine.read_at is None        # своё не помечаем
    assert incoming.read_at is not None  # входящее - прочитано


# --- Доставка только адресату (recipient_id) ---

@pytest.mark.django_db
def test_recipient_seller_thread(buyer, shop):
    conv = Conversation.objects.create(buyer=buyer, seller=shop, kind='seller')
    msg = Message.objects.create(conversation=conv, sender=buyer, body='hi')
    # Сообщение покупателя адресуется продавцу, и наоборот.
    assert delivery._recipient_id(conv, msg, sender=buyer) == shop.id
    assert delivery._recipient_id(conv, msg, sender=shop) == buyer.id


@pytest.mark.django_db
def test_recipient_support_buyer_message_has_no_recipient(buyer):
    conv = Conversation.objects.create(buyer=buyer, kind='support')
    msg = Message.objects.create(conversation=conv, sender=buyer, body='помогите')
    # Сообщение покупателя в поддержку живого WS-адресата не имеет.
    assert delivery._recipient_id(conv, msg, sender=buyer) is None


@pytest.mark.django_db
def test_recipient_support_bot_reply_goes_to_buyer(buyer):
    conv = Conversation.objects.create(buyer=buyer, kind='support')
    bot_msg = Message.objects.create(conversation=conv, sender=None, is_from_bot=True, body='ответ')
    assert delivery._recipient_id(conv, bot_msg, sender=None) == buyer.id


# --- Бот поддержки ---

def test_bot_matches_keyword():
    assert 'возврат' in bot.reply_to('как оформить возврат?').lower()


def test_bot_default_when_no_match():
    # Нет совпадения -> эскалация на оператора, не пусто и не падение.
    reply = bot.reply_to('абракадабра ничего общего')
    assert reply
    assert 'оператор' in reply.lower()


def test_bot_handles_empty_input():
    assert bot.reply_to('') == bot._DEFAULT_REPLY
    assert bot.reply_to(None) == bot._DEFAULT_REPLY


@pytest.mark.django_db
def test_support_message_triggers_bot_reply(buyer, django_capture_on_commit_callbacks):
    conv = Conversation.objects.create(buyer=buyer, kind='support')
    with django_capture_on_commit_callbacks(execute=True):
        res = client_for(buyer).post(
            f'/api/chat/conversations/{conv.id}/messages/', {'body': 'вопрос по возврату'}
        )
    assert res.status_code == 201
    assert 'bot_message' in res.data
    assert res.data['bot_message']['is_from_bot'] is True
    # В БД два сообщения: покупателя и бота.
    assert Message.objects.filter(conversation=conv).count() == 2


# --- Троттлинг отправки ---

@pytest.mark.django_db
def test_chat_throttle(buyer, shop, django_capture_on_commit_callbacks, monkeypatch):
    # DRF фиксирует THROTTLE_RATES на классе при импорте - override_settings его не
    # меняет, поэтому опускаем лимит точечно через get_rate. Кэш чистим (Redis вне
    # транзакции теста).
    from django.core.cache import cache
    from apps.chat.throttling import ChatMessageThrottle
    cache.clear()
    monkeypatch.setattr(ChatMessageThrottle, 'get_rate', lambda self: '2/minute')
    conv = Conversation.objects.create(buyer=buyer, seller=shop, kind='seller')
    c = client_for(buyer)
    with django_capture_on_commit_callbacks(execute=True):
        assert c.post(f'/api/chat/conversations/{conv.id}/messages/', {'body': 'a'}).status_code == 201
        assert c.post(f'/api/chat/conversations/{conv.id}/messages/', {'body': 'b'}).status_code == 201
        assert c.post(f'/api/chat/conversations/{conv.id}/messages/', {'body': 'c'}).status_code == 429
