from django.conf import settings
from django.db import models
from django.db.models import Q


class Conversation(models.Model):
    """Приватный диалог один-на-один (Ф24, узлы 1.16/2.9).

    Два вида (`kind`):
    - `seller`  - покупатель <-> продавец, вопросы по товару/заказу. Оба участника
      реальны (`buyer` и `seller`); `product`/`order` - НЕОБЯЗАТЕЛЬНЫЙ контекст
      («последний привязанный», Q1: один тред на пару, не на товар).
    - `support` - покупатель <-> площадка. `seller=null`, контрагент - бот/оператор-staff.

    Уникальность диалога (анти-дубль, идемпотентный старт §3.3) - ДВА условных
    UniqueConstraint, а не плоский unique_together: для `support` seller=null, а NULL-ы
    в SQL различны, плоский ключ не помешал бы плодить support-треды.
    """

    KIND_SELLER = 'seller'
    KIND_SUPPORT = 'support'
    KIND_CHOICES = [
        (KIND_SELLER, 'С продавцом'),
        (KIND_SUPPORT, 'С поддержкой'),
    ]

    kind = models.CharField(max_length=10, choices=KIND_CHOICES)
    # Инициатор диалога (всегда покупатель/пользователь, открывший тред).
    buyer = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='chats_as_buyer'
    )
    # Контрагент-продавец (для kind=support пусто - отвечает площадка).
    seller = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True,
        related_name='chats_as_seller'
    )
    # Контекст диалога - НЕОБЯЗАТЕЛЬНЫЙ. on_delete=SET_NULL: удаление товара/заказа
    # не рушит переписку (граничный случай §5).
    product = models.ForeignKey(
        'products.Product', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+'
    )
    order = models.ForeignKey(
        'orders.Order', on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    created_at = models.DateTimeField(auto_now_add=True)
    # Двигается при каждом новом сообщении - сортировка списка диалогов «свежие сверху».
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        constraints = [
            # Один seller-тред на пару покупатель-продавец.
            models.UniqueConstraint(
                fields=['buyer', 'seller'],
                condition=Q(kind='seller'),
                name='uniq_seller_thread_per_pair',
            ),
            # Один support-тред на покупателя (seller=null, плоский ключ тут не работает).
            models.UniqueConstraint(
                fields=['buyer'],
                condition=Q(kind='support'),
                name='uniq_support_thread_per_buyer',
            ),
        ]
        indexes = [
            # Список диалогов пользователя как покупателя / как продавца.
            models.Index(fields=['buyer', '-updated_at']),
            models.Index(fields=['seller', '-updated_at']),
        ]

    def __str__(self):
        return f'Conversation #{self.pk} ({self.kind})'

    def other_participant(self, user):
        """Второй участник диалога относительно `user` (адресат доставки §3.4).
        Для support второй участник - площадка (None)."""
        if self.kind == self.KIND_SUPPORT:
            return None
        return self.seller if user == self.buyer else self.buyer


class Message(models.Model):
    """Сообщение в диалоге. Тело - ПЛЕЙН-ТЕКСТ; фронт (React) экранирует при выводе,
    e-mail-канал (Ф25) экранирует свой HTML - XSS не проходит (§8).

    `sender=null` + `is_from_bot=True` - системный ответ бота поддержки.
    `read_at` - индикатор непрочитанного и счётчик бейджа.
    """

    conversation = models.ForeignKey(
        Conversation, on_delete=models.CASCADE, related_name='messages'
    )
    sender = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='+'
    )
    body = models.TextField(max_length=4000)
    is_from_bot = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    read_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['created_at']
        indexes = [
            # Лента сообщений диалога по времени.
            models.Index(fields=['conversation', 'created_at']),
        ]

    def __str__(self):
        return f'Message #{self.pk} in conv #{self.conversation_id}'
