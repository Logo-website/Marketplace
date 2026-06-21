from django.db import transaction
from rest_framework import serializers
from .models import Order, OrderItem
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