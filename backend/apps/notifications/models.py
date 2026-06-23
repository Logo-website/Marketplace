from django.conf import settings
from django.db import models


class Notification(models.Model):
    """Лента уведомлений пользователя (колокольчик, узел 1.17).

    Категория делит уведомления на транзакционные (статус заказа - доходят всегда)
    и маркетинговые (акции/рассылки - уважают отписку через User.notification_prefs).
    `event_type` - ключ реестра шаблонов (например `order.shipped`); `link` - куда
    ведёт клик. Индекс по (recipient, is_read, created_at) - быстрая лента и счётчик
    непрочитанных без денормализации.
    """

    CATEGORY_ORDER = 'order'        # транзакционное: статус заказа - доходит всегда
    CATEGORY_PRICE = 'price'        # цена/наличие - opt-in (price_email/price_push)
    CATEGORY_MARKETING = 'marketing'  # акции/рассылки - opt-in (promos_email/promos_push)
    CATEGORY_CHOICES = [
        (CATEGORY_ORDER, 'Заказы'),
        (CATEGORY_PRICE, 'Цена и наличие'),
        (CATEGORY_MARKETING, 'Акции и рассылки'),
    ]

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications'
    )
    event_type = models.CharField(max_length=50)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default=CATEGORY_ORDER)
    title = models.CharField(max_length=200)
    body = models.TextField(blank=True)
    link = models.CharField(max_length=300, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [models.Index(fields=['recipient', 'is_read', 'created_at'])]

    def __str__(self):
        return f'{self.recipient_id}: {self.event_type}'


class Broadcast(models.Model):
    """Сегментированная рассылка (3.10): админ задаёт сегмент и текст, Celery делает
    fan-out через notify() пачками, уважая отписку. Запускается только из админки."""

    SEGMENT_ALL = 'all'
    SEGMENT_BUYERS = 'buyers'
    SEGMENT_SELLERS = 'sellers'
    SEGMENT_CHOICES = [
        (SEGMENT_ALL, 'Все пользователи'),
        (SEGMENT_BUYERS, 'Покупатели'),
        (SEGMENT_SELLERS, 'Продавцы'),
    ]

    segment = models.CharField(max_length=20, choices=SEGMENT_CHOICES)
    title = models.CharField(max_length=200)
    body = models.TextField()
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    sent_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.get_segment_display()}: {self.title}'
