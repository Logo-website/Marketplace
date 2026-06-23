"""
Единый слой Kafka (P5).

- Продюсер создаётся лениво (`get_producer`), не на импорте - импорт не падает,
  если Kafka недоступна (S9).
- Публикация идёт асинхронно через Celery-задачу `apps.orders.tasks.publish_order_event`
  (S8): HTTP-путь не блокируется недоступным/медленным брокером.
- `KafkaService.*` строит JSON-payload из заказа в веб-процессе (примитивы), чтобы через
  границу Celery не передавать ORM-объект.
"""
import json
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

_producer = None


def get_producer():
    """Ленивый Kafka-продюсер. Соединение создаётся при первом вызове, не на импорте."""
    global _producer
    if _producer is None:
        try:
            from kafka import KafkaProducer
            _producer = KafkaProducer(
                bootstrap_servers=settings.KAFKA_BOOTSTRAP_SERVERS,
                value_serializer=lambda v: json.dumps(v).encode('utf-8'),
            )
        except Exception as e:
            logger.error(f'Kafka producer init error: {e}')
            return None
    return _producer


def publish_event(topic, data):
    """
    Синхронная публикация в Kafka. Вызывается из Celery-задачи (вне HTTP-пути).
    Ошибка брокера не валит задачу, только пишется в лог.
    """
    producer = get_producer()
    if producer is None:
        return
    try:
        producer.send(topic, data)
        producer.flush()
    except Exception as e:
        logger.error(f'Kafka publish error ({topic}): {e}')


class KafkaService:
    """
    Единая точка входа для вещания событий из веб-процесса.
    Ставит задачу в Celery (S8); `.delay()` обёрнут в try/except, чтобы недоступный
    брокер не ронял ответ.
    """

    @staticmethod
    def user_notification(recipient_id, payload):
        """Живой колокольчик (Ф25): уведомление по пользователю. node_service роутит
        по recipient_id (обобщение buyer_id), отдаёт клиенту payload как user.notification."""
        KafkaService._dispatch('user.notification', {
            'recipient_id': recipient_id,
            'notification': payload,
        })

    @staticmethod
    def chat_message(recipient_id, payload):
        """Живая доставка сообщения чата (Ф24): отдельный топик chat.message - чтобы не
        смешивать с лентой-колокольчиком (user.notification). node роутит по recipient_id
        (только адресату - граница приватности §8), отдаёт клиенту как chat.message.
        payload - примитивы без PII: {conversation_id, message_id, sender_id, preview}."""
        KafkaService._dispatch('chat.message', {
            'recipient_id': recipient_id,
            'message': payload,
        })

    @staticmethod
    def _dispatch(topic, data):
        try:
            from apps.orders.tasks import publish_order_event
            publish_order_event.delay(topic, data)
        except Exception as e:
            logger.error(f'Kafka dispatch error ({topic}): {e}')
