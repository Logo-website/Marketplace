"""Каналы доставки уведомления (§4.3). Единый интерфейс; реальный провайдер есть
только у on-site (WS через Kafka) и e-mail (Resend). SMS/push - заглушка (карта
допускает эмуляцию, реальные Twilio/FCM вне учебного скоупа)."""
import logging

from services.kafka_service import KafkaService
from .serializers import NotificationSerializer
from .tasks import send_notification_email

logger = logging.getLogger(__name__)


def deliver_onsite_live(notification):
    """Живой колокольчик: публикуем в Kafka топик user.notification, node_service
    роутит по recipient_id (S5: id из проверенного токена, не из сообщения клиента)."""
    payload = NotificationSerializer(notification).data
    KafkaService.user_notification(notification.recipient_id, payload)


def send_email(user, subject, html):
    """E-mail-канал: адрес берём ТОЛЬКО из user.email (анти-relay/анти-enumeration,
    §8), никогда из входных данных запроса. Пустой email - молча пропускаем."""
    if not user.email:
        return
    try:
        send_notification_email.delay(user.email, subject, html)
    except Exception as e:
        logger.error(f'notification email dispatch error (user={user.id}): {e}')


def deliver_sms_push_stub(user, notification):
    """SMS/push - заглушка-провайдер: no-op + лог. Реальная отправка - отдельная фаза
    (провайдер вне учебного скоупа, §6)."""
    logger.debug(
        f'[sms/push stub] user={user.id} event={notification.event_type} (провайдер не подключён)'
    )
