from celery import shared_task
from django.core.mail import send_mail
from django.conf import settings


@shared_task
def send_order_confirmation_email(order_id, buyer_email, total_price):
    send_mail(
        subject=f'Заказ #{order_id} подтверждён',
        message=f'Ваш заказ #{order_id} на сумму {total_price} руб. успешно оформлен.',
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[buyer_email],
        fail_silently=True,
    )


@shared_task
def send_order_status_email(order_id, buyer_email, new_status):
    status_names = {
        'paid': 'Оплачен',
        'processing': 'В обработке',
        'shipped': 'Отправлен',
        'delivered': 'Доставлен',
        'cancelled': 'Отменён',
    }
    status_name = status_names.get(new_status, new_status)
    send_mail(
        subject=f'Статус заказа #{order_id} изменён',
        message=f'Статус вашего заказа #{order_id} изменён на: {status_name}',
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[buyer_email],
        fail_silently=True,
    )