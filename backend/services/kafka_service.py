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
    Единая точка входа для вещания событий заказа из веб-процесса.
    Ставит задачу в Celery (S8); `.delay()` обёрнут в try/except, чтобы недоступный
    брокер не ронял ответ.
    """

    @staticmethod
    def order_created(order):
        KafkaService._dispatch('order.created', {
            'order_id': order.id,
            'buyer_id': order.buyer_id,
            'total': str(order.total_price),
        })

    @staticmethod
    def order_status_changed(order):
        KafkaService._dispatch('order.status_changed', {
            'order_id': order.id,
            'status': order.status,
            'buyer_id': order.buyer_id,
        })

    @staticmethod
    def _dispatch(topic, data):
        try:
            from apps.orders.tasks import publish_order_event
            publish_order_event.delay(topic, data)
        except Exception as e:
            logger.error(f'Kafka dispatch error ({topic}): {e}')
