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

    buyer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='orders')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_CREATED)
    total_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    delivery_address = models.TextField()
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
    quantity = models.PositiveIntegerField(default=1)
    price_at_purchase = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f'{self.product_name or "Удалённый товар"} x{self.quantity}'