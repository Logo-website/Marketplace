import logging
import resend
from celery import shared_task
from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)

resend.api_key = settings.RESEND_API_KEY

# Размер пачки fan-out рассылки (3.10): шлём порциями, не одним циклом, чтобы не
# ддосить Resend и не держать память на огромном сегменте.
BROADCAST_BATCH = 200


@shared_task
def send_notification_email(to_email, subject, html):
    """Письмо уведомления через Resend (паттерн orders/tasks). Вне HTTP-пути.
    Адрес приходит только из user.email (канал, не из запроса) - см. channels.send_email.
    Сбой Resend не валит задачу, только лог."""
    try:
        resend.Emails.send({
            'from': settings.DEFAULT_FROM_EMAIL,
            'to': [to_email],
            'subject': subject,
            'html': html,
        })
    except Exception as e:
        logger.error(f'Resend error (notification email): {e}')


@shared_task
def run_broadcast(broadcast_id):
    """Fan-out сегментированной рассылки пачками через notify() (category=marketing).
    Отписавшиеся (promos_email/on-site всегда) исключаются внутри notify()."""
    from django.contrib.auth import get_user_model
    from .models import Broadcast
    from .services import notify

    User = get_user_model()
    try:
        broadcast = Broadcast.objects.get(pk=broadcast_id)
    except Broadcast.DoesNotExist:
        logger.error(f'run_broadcast: рассылка {broadcast_id} не найдена')
        return

    qs = User.objects.all()
    if broadcast.segment == Broadcast.SEGMENT_BUYERS:
        qs = qs.filter(role=User.ROLE_BUYER)
    elif broadcast.segment == Broadcast.SEGMENT_SELLERS:
        qs = qs.filter(role=User.ROLE_SELLER)
    # SEGMENT_ALL - все пользователи.

    ctx = {'title': broadcast.title, 'body': broadcast.body}
    sent = 0
    for user in qs.iterator(chunk_size=BROADCAST_BATCH):
        notify(user, 'broadcast', ctx, category='marketing')
        sent += 1

    broadcast.sent_at = timezone.now()
    broadcast.save(update_fields=['sent_at'])
    logger.info(f'run_broadcast {broadcast_id}: обработано получателей {sent}')
