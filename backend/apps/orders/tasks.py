from celery import shared_task

from services.kafka_service import publish_event


@shared_task
def publish_order_event(topic, data):
    """Асинхронная публикация события в Kafka (S8). Вне HTTP-пути.

    Универсальная задача публикации: используется и для событий заказа, и для
    user.notification (Ф25). Письма заказа переехали в центр уведомлений
    (apps.notifications) - см. orders/views.py -> notify()."""
    publish_event(topic, data)
