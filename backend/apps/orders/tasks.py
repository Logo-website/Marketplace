import resend
import logging
from celery import shared_task
from django.conf import settings

logger = logging.getLogger(__name__)

resend.api_key = settings.RESEND_API_KEY

STATUS_NAMES = {
    'paid':       'Оплачен',
    'processing': 'В обработке',
    'shipped':    'Отправлен',
    'delivered':  'Доставлен',
    'cancelled':  'Отменён',
}


@shared_task
def send_order_confirmation_email(order_id, buyer_email, total_price):
    try:
        resend.Emails.send({
            'from': settings.DEFAULT_FROM_EMAIL,
            'to': [buyer_email],
            'subject': f'Заказ #{order_id} подтверждён — Marketplace',
            'html': f'''
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #111;">Заказ оформлен ✅</h2>
                    <p>Ваш заказ <strong>#{order_id}</strong> на сумму <strong>{total_price} ₽</strong> успешно оформлен.</p>
                    <p style="color: #666;">Мы уведомим вас когда статус изменится.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #999; font-size: 12px;">Marketplace — ваш любимый магазин одежды</p>
                </div>
            ''',
        })
    except Exception as e:
        logger.error(f'Resend error (order confirmation {order_id}): {e}')


@shared_task
def send_order_status_email(order_id, buyer_email, new_status):
    try:
        status_name = STATUS_NAMES.get(new_status, new_status)
        resend.Emails.send({
            'from': settings.DEFAULT_FROM_EMAIL,
            'to': [buyer_email],
            'subject': f'Статус заказа #{order_id} изменён — Marketplace',
            'html': f'''
                <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #111;">Статус заказа изменён</h2>
                    <p>Заказ <strong>#{order_id}</strong> теперь имеет статус: <strong>{status_name}</strong></p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #999; font-size: 12px;">Marketplace — ваш любимый магазин одежды</p>
                </div>
            ''',
        })
    except Exception as e:
        logger.error(f'Resend error (status update {order_id}): {e}')