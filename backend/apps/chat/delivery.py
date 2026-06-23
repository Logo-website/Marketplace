"""Доставка сообщения в реальном времени (§3.4).

Запись идёт через REST (Django - доверенный слой). Доставка - через уже существующий
Kafka -> node WS -> клиент, переиспользуя транспорт Ф25 (отдельный топик chat.message,
роутинг по recipient_id - только адресату, граница приватности §8).

Адресат (recipient_id):
- seller-тред: второй участник (отправитель-покупатель -> продавцу, и наоборот).
- support-тред: сообщение ПОКУПАТЕЛЯ живого WS-адресата не имеет (видно staff в админке,
  не публикуем); ответ бота/оператора доставляется покупателю.

Публикация - через transaction.on_commit (S8): событие уходит только после коммита
сообщения; недоступный брокер не валит HTTP-ответ (внутри KafkaService).
"""
from django.db import transaction

from services.kafka_service import KafkaService

from .models import Conversation


def _recipient_id(conversation, message, sender):
    if conversation.kind == Conversation.KIND_SELLER:
        # Второй участник относительно отправителя.
        other = conversation.other_participant(sender)
        return other.id if other else None
    # support-тред.
    if sender is None or sender != conversation.buyer:
        # Бот или оператор-staff -> покупателю.
        return conversation.buyer_id
    # Сообщение покупателя в поддержку - живого адресата нет.
    return None


def deliver_message(conversation, message, sender):
    """Поставить доставку сообщения адресату после коммита. Нет адресата -> no-op."""
    recipient_id = _recipient_id(conversation, message, sender)
    if recipient_id is None:
        return

    payload = {
        'conversation_id': conversation.id,
        'message_id': message.id,
        'sender_id': message.sender_id,
        'is_from_bot': message.is_from_bot,
        # Короткое превью (без PII - только тело, адресат и так участник диалога).
        'preview': message.body[:120],
    }
    transaction.on_commit(lambda: KafkaService.chat_message(recipient_id, payload))
