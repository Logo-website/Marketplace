from django.db import models, transaction
from apps.users.models import User
from apps.products.models import Product


class Order(models.Model):
    STATUS_CREATED = 'created'
    STATUS_PAID = 'paid'
    STATUS_PROCESSING = 'processing'
    STATUS_SHIPPED = 'shipped'
    STATUS_DELIVERED = 'delivered'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_CREATED, 'Создан'),
        (STATUS_PAID, 'Оплачен'),
        (STATUS_PROCESSING, 'В обработке'),
        (STATUS_SHIPPED, 'Отправлен'),
        (STATUS_DELIVERED, 'Доставлен'),
        (STATUS_CANCELLED, 'Отменён'),
    ]

    # Способ доставки (Ф9). Упрощённая схема - реальная FBO/FBS логистика в Ф32.
    # Постамат сворачивается в самовывоз, отдельного типа пока нет (план Ф9, п.6).
    DELIVERY_PICKUP = 'pickup'
    DELIVERY_COURIER = 'courier'
    DELIVERY_POST = 'post'
    DELIVERY_CHOICES = [
        (DELIVERY_PICKUP, 'Самовывоз'),
        (DELIVERY_COURIER, 'Курьер'),
        (DELIVERY_POST, 'Почта России'),
    ]

    # Способ оплаты (Ф9) - заглушка: сохраняется, но реального эквайринга нет (4.5).
    PAYMENT_CARD = 'card'
    PAYMENT_ON_DELIVERY = 'on_delivery'
    PAYMENT_INSTALLMENTS = 'installments'
    PAYMENT_CHOICES = [
        (PAYMENT_CARD, 'Картой онлайн'),
        (PAYMENT_ON_DELIVERY, 'При получении'),
        (PAYMENT_INSTALLMENTS, 'Частями'),
    ]

    buyer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='orders')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_CREATED)
    total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    delivery_address = models.TextField()
    # Снимок чекаута (Ф9): получатель/способ доставки/оплата фиксируются на момент
    # покупки - заказ самодостаточен, как product_name/price_at_purchase в OrderItem.
    recipient_name = models.CharField(max_length=200, blank=True, default='')
    recipient_phone = models.CharField(max_length=20, blank=True, default='')
    recipient_email = models.EmailField(blank=True, default='')
    delivery_method = models.CharField(max_length=20, choices=DELIVERY_CHOICES, default=DELIVERY_PICKUP)
    payment_method = models.CharField(max_length=20, choices=PAYMENT_CHOICES, default=PAYMENT_CARD)
    comment = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'Order #{self.id} — {self.buyer.email}'

    class Meta:
        ordering = ['-created_at']

    def cancel(self):
        """
        Отменяет заказ и возвращает остатки товаров.
        Идемпотентно — повторная отмена не удваивает остатки.
        """
        if self.status == self.STATUS_CANCELLED:
            return False  # уже отменён

        with transaction.atomic():
            order = Order.objects.select_for_update().get(pk=self.pk)
            if order.status == self.STATUS_CANCELLED:
                return False

            # Возвращаем остатки.
            # of=('self',) блокирует только строки OrderItem: без него select_for_update
            # пытается лочить nullable-сторону LEFT JOIN к product (on_delete=SET_NULL),
            # что Postgres запрещает ("FOR UPDATE cannot be applied to the nullable side").
            for item in order.items.select_related('product').select_for_update(of=('self',)):
                if item.product:
                    Product.objects.filter(pk=item.product.pk).update(
                        stock=models.F('stock') + item.quantity
                    )

            order.status = self.STATUS_CANCELLED
            order.save(update_fields=['status', 'updated_at'])
            self.status = self.STATUS_CANCELLED
        return True


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.SET_NULL, null=True)
    product_name = models.CharField(max_length=500, default='')
    # Вариант снимком (Ф8): размер/цвет фиксируются на момент покупки, как
    # product_name/price - заказ остаётся читаемым после удаления товара.
    size = models.CharField(max_length=50, blank=True, default='')
    color = models.CharField(max_length=50, blank=True, default='')
    quantity = models.PositiveIntegerField(default=1)
    price_at_purchase = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f'{self.product_name or "Удалённый товар"} x{self.quantity}'