from decimal import Decimal
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
    # Момент доставки (Ф23): от него отсчитывается срок возврата (settings.RETURN_PERIOD_DAYS).
    # Отдельное поле, а не updated_at - тот меняется при любом save() и для срока
    # ненадёжен. Заполняется один раз при переходе shipped->delivered (orders/views.py).
    delivered_at = models.DateTimeField(null=True, blank=True)

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


class ReturnRequest(models.Model):
    """Заявка на возврат доставленного заказа (Ф23, узлы 1.14/2.7/3.9).

    Отдельная сущность, не статус-поля на Order: возврат идёт ПО ПОЗИЦИЯМ, имеет
    свою машину статусов на трёх ролях (покупатель/продавец/админ) и расщепляется
    по продавцам (одна заявка - один продавец). Развязка с отменой заказа (Ф9):
    возврат - только для уже доставленного, сток восстанавливается при приёмке.
    Реальные деньги/комиссия - Ф30 (здесь refund_amount - эмуляция).
    """
    STATUS_REQUESTED = 'requested'
    STATUS_APPROVED = 'approved'
    STATUS_RECEIVED = 'received'
    STATUS_REFUNDED = 'refunded'
    STATUS_REJECTED = 'rejected'
    STATUS_DISPUTED = 'disputed'
    STATUS_CHOICES = [
        (STATUS_REQUESTED, 'Заявка подана'),
        (STATUS_APPROVED, 'Одобрен'),
        (STATUS_RECEIVED, 'Товар принят'),
        (STATUS_REFUNDED, 'Деньги возвращены'),
        (STATUS_REJECTED, 'Отклонён'),
        (STATUS_DISPUTED, 'Спор'),
    ]

    # Статусы, в которых заявка считается "активной" - блокирует повторную заявку
    # на ту же позицию (§4.1). refunded/rejected (после арбитража) - завершённые.
    ACTIVE_STATUSES = [STATUS_REQUESTED, STATUS_APPROVED, STATUS_RECEIVED, STATUS_DISPUTED]

    # Машина статусов (§4.2). Роль каждого перехода проверяется во вьюхе/эндпоинте:
    # requested->approved/rejected, approved->received, received->refunded - продавец;
    # rejected->disputed - покупатель; disputed->approved/rejected - админ (финал).
    VALID_TRANSITIONS = {
        STATUS_REQUESTED: [STATUS_APPROVED, STATUS_REJECTED],
        STATUS_APPROVED: [STATUS_RECEIVED],
        STATUS_RECEIVED: [STATUS_REFUNDED],
        STATUS_REJECTED: [STATUS_DISPUTED],
        STATUS_DISPUTED: [STATUS_APPROVED, STATUS_REJECTED],
        STATUS_REFUNDED: [],
    }

    # Причины fashion-специфики из карты-смысла (1.14). Текст - свободное поле reason_text.
    REASON_SIZE = 'size'
    REASON_DEFECT = 'defect'
    REASON_NOT_AS_DESCRIBED = 'not_as_described'
    REASON_CHANGED_MIND = 'changed_mind'
    REASON_OTHER = 'other'
    REASON_CHOICES = [
        (REASON_SIZE, 'Не подошёл размер'),
        (REASON_DEFECT, 'Брак / дефект'),
        (REASON_NOT_AS_DESCRIBED, 'Не соответствует описанию'),
        (REASON_CHANGED_MIND, 'Передумал'),
        (REASON_OTHER, 'Другое'),
    ]

    # Способ возврата (1.14). Реальная логистика/ПВЗ - Ф32, здесь только выбор.
    METHOD_PICKUP = 'pickup'
    METHOD_COURIER = 'courier'
    METHOD_CHOICES = [
        (METHOD_PICKUP, 'Пункт выдачи'),
        (METHOD_COURIER, 'Курьер'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='returns')
    # buyer/seller денормализованы для прав и фильтрации (S4): продавец видит свои
    # заявки по seller=user, покупатель - свои по buyer=user. seller - один на заявку.
    buyer = models.ForeignKey(User, on_delete=models.CASCADE, related_name='return_requests')
    seller = models.ForeignKey(User, on_delete=models.CASCADE, related_name='seller_returns')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_REQUESTED)
    reason = models.CharField(max_length=30, choices=REASON_CHOICES)
    reason_text = models.TextField(blank=True, default='')  # UGC, рендерится как текст (§8)
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default=METHOD_PICKUP)
    # Фото причины (брак/несоответствие) - UGC, опционально (§5). Показ как <img>, не HTML.
    photo = models.ImageField(upload_to='returns/', blank=True, null=True)
    resolution_comment = models.TextField(blank=True, default='')  # комментарий продавца/админа
    # Сумма к возврату - денорм. сумма snapshot-цен позиций (эмуляция; реальные деньги Ф30).
    refund_amount = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    # Решение админа из disputed финально (§4.2): arbitrated=True запрещает повторный спор.
    arbitrated = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'Возврат #{self.id} к заказу #{self.order_id} ({self.status})'

    def compute_refund_amount(self):
        """Сумма к возврату = сумма snapshot-цен возвращаемых позиций. Цену не
        дублируем на ReturnItem - берём неизменяемый OrderItem.price_at_purchase."""
        return sum(
            (ri.order_item.price_at_purchase * ri.quantity for ri in self.items.all()),
            Decimal('0'),
        )

    def receive(self):
        """Приёмка товара продавцом (approved->received): восстанавливает сток.

        Тем же приёмом, что Order.cancel() - атомарно, идемпотентно
        (select_for_update + проверка текущего статуса), F('stock')+qty. Сток
        возвращается ТОЛЬКО при приёмке и только для существующего товара
        (удалённый product=None пропускаем - восстанавливать некуда).
        """
        with transaction.atomic():
            req = ReturnRequest.objects.select_for_update().get(pk=self.pk)
            if req.status != self.STATUS_APPROVED:
                return False  # не из approved - двойной клик/гонка не удвоят сток
            for ri in req.items.select_related('order_item__product'):
                product = ri.order_item.product
                if product:
                    Product.objects.filter(pk=product.pk).update(
                        stock=models.F('stock') + ri.quantity
                    )
            req.status = self.STATUS_RECEIVED
            req.save(update_fields=['status', 'updated_at'])
            self.status = self.STATUS_RECEIVED
        return True


class ReturnItem(models.Model):
    """Позиция возврата (§4.1). Возврат по позициям - можно вернуть одну вещь из
    заказа. Цену не дублируем: берётся из order_item.price_at_purchase (snapshot)."""
    return_request = models.ForeignKey(ReturnRequest, on_delete=models.CASCADE, related_name='items')
    order_item = models.ForeignKey(OrderItem, on_delete=models.CASCADE, related_name='return_items')
    quantity = models.PositiveIntegerField(default=1)

    def __str__(self):
        return f'{self.order_item.product_name} x{self.quantity} (возврат #{self.return_request_id})'