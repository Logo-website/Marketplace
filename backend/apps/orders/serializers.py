from decimal import Decimal
from django.db import transaction
from rest_framework import serializers
from .models import Order, OrderItem, ReturnRequest, ReturnItem
from apps.products.models import Product


class OrderItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)

    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'product_name', 'size', 'color', 'quantity', 'price_at_purchase']
        read_only_fields = ['price_at_purchase']


class OrderCreateSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True)

    class Meta:
        model = Order
        fields = ['delivery_address', 'comment', 'items']

    def validate_items(self, items):
        if not items:
            raise serializers.ValidationError('Заказ не может быть пустым.')
        for item in items:
            if item['quantity'] < 1:
                raise serializers.ValidationError('Количество должно быть больше 0.')
        return items

    def create(self, validated_data):
        items_data = validated_data.pop('items')

        with transaction.atomic():
            order = Order.objects.create(
                buyer=self.context['request'].user,
                **validated_data
            )
            total = 0
            for item_data in items_data:
                product = Product.objects.select_for_update().get(id=item_data['product'].id)

                if product.status != 'active':
                    raise serializers.ValidationError(
                        f'Товар "{product.name}" недоступен для заказа.'
                    )
                if product.stock < item_data['quantity']:
                    raise serializers.ValidationError(
                        f'Недостаточно товара "{product.name}" на складе. Доступно: {product.stock}.'
                    )

                product.stock -= item_data['quantity']
                product.save()

                price = product.price
                quantity = item_data['quantity']
                OrderItem.objects.create(
                    order=order,
                    product=product,
                    quantity=quantity,
                    price_at_purchase=price
                )
                total += price * quantity

            order.total_price = total
            order.save()
            return order


class OrderSerializer(serializers.ModelSerializer):
    items = OrderItemSerializer(many=True, read_only=True)

    class Meta:
        model = Order
        fields = [
            'id', 'status', 'total_price', 'delivery_address',
            'recipient_name', 'recipient_phone', 'recipient_email',
            'delivery_method', 'payment_method',
            'comment', 'items', 'created_at',
        ]


class SellerOrderItemSerializer(serializers.ModelSerializer):
    # Имя берём из модельного снапшота product_name, а НЕ source='product.name'
    # (как в OrderItemSerializer): при удалённом товаре (product=NULL, SET_NULL)
    # source вернул бы null, а снапшот сохраняет читаемое имя позиции (план 4.1, §6).
    class Meta:
        model = OrderItem
        fields = ['id', 'product', 'product_name', 'size', 'color', 'quantity', 'price_at_purchase']


class SellerOrderSerializer(serializers.ModelSerializer):
    """
    Заказ глазами продавца (Ф14): только нужное для исполнения, без чужого.

    Отдаёт имя получателя, адрес, комментарий, СВОИ позиции и их сумму. E-mail и
    телефон покупателя НЕ отдаются (PII-минимизация, план 4.4, зеркало S17).
    В смешанном заказе чужие позиции и полный total_price скрыты (план 4.2).

    Требует `seller` в context (продавец, от чьего лица смотрим).
    """
    items = serializers.SerializerMethodField()
    seller_total = serializers.SerializerMethodField()
    buyer_name = serializers.SerializerMethodField()
    can_update_status = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = [
            'id', 'status', 'created_at', 'delivery_address', 'comment',
            'buyer_name', 'items', 'seller_total', 'can_update_status',
        ]

    def _own_items(self, order):
        seller = self.context['seller']
        return [it for it in order.items.all()
                if it.product_id and it.product and it.product.seller_id == seller.id]

    def get_items(self, order):
        return SellerOrderItemSerializer(self._own_items(order), many=True).data

    def get_seller_total(self, order):
        # Сумма ТОЛЬКО своих позиций. Строкой - как DecimalField total_price у
        # OrderSerializer (фронт уже делает Number() над этим форматом).
        total = sum((it.price_at_purchase * it.quantity for it in self._own_items(order)), Decimal('0'))
        return str(total)

    def get_buyer_name(self, order):
        # Имя получателя из снимка чекаута; фолбэк - username покупателя.
        return order.recipient_name or order.buyer.username

    def get_can_update_status(self, order):
        # True только если ВСЕ позиции - этого продавца. Совпадает с queryset
        # смены-статуса (OrderStatusUpdateView): чужая или удалённая (product=NULL)
        # позиция -> False, заказ для продавца read-only (план 4.2).
        seller = self.context['seller']
        return all(it.product_id and it.product and it.product.seller_id == seller.id
                   for it in order.items.all())


# ------------------- Возвраты (Ф23) -------------------

class ReturnItemSerializer(serializers.ModelSerializer):
    """Позиция возврата для чтения. Имя/размер/цвет/цена - из снапшота OrderItem,
    читаемы даже после удаления товара (как SellerOrderItemSerializer)."""
    order_item = serializers.IntegerField(source='order_item.id', read_only=True)
    product_name = serializers.CharField(source='order_item.product_name', read_only=True)
    size = serializers.CharField(source='order_item.size', read_only=True)
    color = serializers.CharField(source='order_item.color', read_only=True)
    price_at_purchase = serializers.DecimalField(
        source='order_item.price_at_purchase', max_digits=10, decimal_places=2, read_only=True
    )

    class Meta:
        model = ReturnItem
        fields = ['id', 'order_item', 'product_name', 'size', 'color', 'quantity', 'price_at_purchase']


class ReturnRequestSerializer(serializers.ModelSerializer):
    """Заявка глазами покупателя (1.14): свои статусы и позиции. БЕЗ PII продавца
    (ни email/phone) - покупатель видит только статус и комментарий решения (§8)."""
    items = ReturnItemSerializer(many=True, read_only=True)
    reason_display = serializers.CharField(source='get_reason_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    order_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = ReturnRequest
        fields = [
            'id', 'order_id', 'status', 'status_display', 'reason', 'reason_display',
            'reason_text', 'method', 'photo', 'refund_amount', 'resolution_comment',
            'arbitrated', 'created_at', 'items',
        ]


class SellerReturnSerializer(serializers.ModelSerializer):
    """Заявка глазами продавца (2.7): нужное для решения, без PII покупателя.
    Имя покупателя - только username/имя получателя, НЕ email/phone (зеркало S17)."""
    items = ReturnItemSerializer(many=True, read_only=True)
    reason_display = serializers.CharField(source='get_reason_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    order_id = serializers.IntegerField(read_only=True)
    buyer_name = serializers.SerializerMethodField()

    class Meta:
        model = ReturnRequest
        fields = [
            'id', 'order_id', 'status', 'status_display', 'reason', 'reason_display',
            'reason_text', 'method', 'photo', 'refund_amount', 'resolution_comment',
            'arbitrated', 'created_at', 'buyer_name', 'items',
        ]

    def get_buyer_name(self, obj):
        # Имя получателя из снимка чекаута; фолбэк - username. Без email/phone.
        return obj.order.recipient_name or obj.buyer.username