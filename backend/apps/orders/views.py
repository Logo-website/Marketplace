import logging
from django.db import transaction
from django.db.models import Exists, OuterRef
from rest_framework import generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Order, OrderItem
from .serializers import OrderSerializer, OrderCreateSerializer
from .tasks import send_order_confirmation_email, send_order_status_email
from apps.cart.cart import get_cart, clear_cart
from apps.products.models import Product
from services.kafka_service import KafkaService
from services.clickhouse_service import ClickHouseService

logger = logging.getLogger(__name__)


def validate_cart_items(cart):
    """
    Валидирует товары из корзины.
    Возвращает (items, errors) — список позиций и список ошибок по позициям.
    """
    items = []
    errors = []

    for product_id, quantity in cart.items():
        try:
            product = Product.objects.select_for_update().get(
                id=int(product_id), status='active'
            )
            if product.stock < quantity:
                errors.append({
                    'product_id': product_id,
                    'error': f'Недостаточно товара "{product.name}": в наличии {product.stock}, в корзине {quantity}'
                })
            else:
                items.append({
                    'product': product,
                    'quantity': quantity,
                    'price': product.price,
                })
        except Product.DoesNotExist:
            errors.append({
                'product_id': product_id,
                'error': f'Товар {product_id} недоступен или снят с продажи'
            })

    return items, errors


def on_order_created(order):
    """
    Единое место для всех побочных эффектов после создания заказа.
    Вызывается из обоих эндпоинтов.

    Все побочки диспатчатся через transaction.on_commit (commit-safety, S8):
    иначе Celery-воркер может стартовать задачу до коммита транзакции и не найти
    заказ (Order.DoesNotExist). Если транзакция не открыта, on_commit выполняет
    callback немедленно - оба эндпоинта вызывают эту функцию уже после коммита.
    Через границу Celery передаём только примитивы, не ORM-объекты.
    """
    order_id = order.id
    buyer_id = order.buyer_id
    buyer_email = order.buyer.email
    total = str(order.total_price)
    product_ids = [item.product_id for item in order.items.all() if item.product_id]

    def dispatch():
        try:
            send_order_confirmation_email.delay(order_id, buyer_email, total)
            KafkaService.order_created(order)
            for product_id in product_ids:
                ClickHouseService.log_purchase(buyer_id, product_id, order_id)
        except Exception as e:
            logger.error(f'on_order_created dispatch error for order {order_id}: {e}')

    transaction.on_commit(dispatch)


class OrderListCreateView(generics.ListCreateAPIView):
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return OrderCreateSerializer
        return OrderSerializer

    def get_queryset(self):
        return Order.objects.filter(buyer=self.request.user).prefetch_related('items')

    def perform_create(self, serializer):
        order = serializer.save()
        on_order_created(order)


class OrderFromCartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        cart = get_cart(request.user.id)
        if not cart:
            return Response({'error': 'Корзина пуста'}, status=400)

        delivery_address = request.data.get('delivery_address', '').strip()
        if not delivery_address:
            return Response({'error': 'Укажите адрес доставки'}, status=400)

        with transaction.atomic():
            items, errors = validate_cart_items(cart)

            if errors:
                return Response({'errors': errors}, status=400)

            total_price = sum(i['price'] * i['quantity'] for i in items)

            order = Order.objects.create(
                buyer=request.user,
                delivery_address=delivery_address,
                comment=request.data.get('comment', ''),
                total_price=total_price,
            )

            for i in items:
                OrderItem.objects.create(
                    order=order,
                    product=i['product'],
                    product_name=i['product'].name,
                    quantity=i['quantity'],
                    price_at_purchase=i['price'],
                )
                # Уменьшаем остатки
                Product.objects.filter(pk=i['product'].pk).update(
                    stock=i['product'].stock - i['quantity']
                )

        clear_cart(request.user.id)
        on_order_created(order)

        return Response(OrderSerializer(order).data, status=201)


class OrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Order.objects.filter(buyer=self.request.user)


class OrderStatusUpdateView(generics.UpdateAPIView):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = OrderSerializer
    http_method_names = ['patch']

    def get_queryset(self):
        user = self.request.user
        if user.role == 'seller':
            # Продавец ведёт заказ только если ВСЕ позиции - его (S4).
            # Смешанный заказ (есть чужая или удалённая позиция) - только admin,
            # иначе продавец A смог бы отменить заказ и восстановить сток продавца B.
            foreign_items = OrderItem.objects.filter(
                order=OuterRef('pk')
            ).exclude(product__seller=user)
            return (
                Order.objects
                .filter(items__product__seller=user)
                .exclude(Exists(foreign_items))
                .distinct()
            )
        if user.role == 'admin':
            return Order.objects.all()
        return Order.objects.none()

    def patch(self, request, *args, **kwargs):
        order = self.get_object()
        new_status = request.data.get('status')

        valid_transitions = {
            'created':    ['paid', 'cancelled'],
            'paid':       ['processing', 'cancelled'],
            'processing': ['shipped', 'cancelled'],
            'shipped':    ['delivered'],
            'delivered':  [],
            'cancelled':  [],
        }

        if new_status not in valid_transitions.get(order.status, []):
            return Response(
                {'error': f'Нельзя перевести заказ из "{order.status}" в "{new_status}"'},
                status=400
            )

        if new_status == 'cancelled':
            order.cancel()
        else:
            order.status = new_status
            order.save(update_fields=['status', 'updated_at'])

        try:
            send_order_status_email.delay(order.id, order.buyer.email, new_status)
        except Exception as e:
            logger.error(f'Status email error: {e}')

        KafkaService.order_status_changed(order)

        return Response(OrderSerializer(order).data)


class OrderCancelView(APIView):
    """
    Покупатель может отменить заказ только в статусе created или paid.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, buyer=request.user)
        except Order.DoesNotExist:
            return Response({'error': 'Заказ не найден'}, status=404)

        if order.status not in ['created', 'paid']:
            return Response(
                {'error': f'Нельзя отменить заказ в статусе "{order.status}". Отмена доступна только для новых и оплаченных заказов.'},
                status=400
            )

        cancelled = order.cancel()
        if not cancelled:
            return Response({'error': 'Заказ уже отменён'}, status=400)

        try:
            send_order_status_email.delay(order.id, order.buyer.email, 'cancelled')
        except Exception as e:
            logger.error(f'Cancel email error: {e}')

        KafkaService.order_status_changed(order)

        return Response(OrderSerializer(order).data)