from rest_framework import generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Order
from .serializers import OrderSerializer, OrderCreateSerializer
from .tasks import send_order_confirmation_email
from kafka_producer import publish_event
from clickhouse import track_event
from apps.cart.cart import get_cart, clear_cart
from apps.products.models import Product
from .tasks import send_order_confirmation_email, send_order_status_email

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
        send_order_confirmation_email.delay(
            order.id,
            order.buyer.email,
            str(order.total_price)
        )
        publish_event('order.created', {
            'order_id': order.id,
            'buyer_id': order.buyer.id,
            'buyer_email': order.buyer.email,
            'total_price': str(order.total_price),
            'status': order.status,
        })
        for item in order.items.all():
            track_event('purchase', order.buyer.id, item.product.id, order.id)


class OrderFromCartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        cart = get_cart(request.user.id)
        if not cart:
            return Response({'error': 'Корзина пуста'}, status=400)

        delivery_address = request.data.get('delivery_address', '')
        if not delivery_address:
            return Response({'error': 'Укажите адрес доставки'}, status=400)

        items = []
        for product_id, quantity in cart.items():
            try:
                product = Product.objects.get(id=int(product_id), status='active')
                items.append({'product': product.id, 'quantity': quantity})
            except Product.DoesNotExist:
                return Response({'error': f'Товар {product_id} недоступен'}, status=400)

        serializer = OrderCreateSerializer(
            data={'delivery_address': delivery_address, 'comment': request.data.get('comment', ''), 'items': items},
            context={'request': request}
        )
        if serializer.is_valid():
            order = serializer.save()
            clear_cart(request.user.id)
            send_order_confirmation_email.delay(order.id, order.buyer.email, str(order.total_price))
            publish_event('order.created', {
                'order_id': order.id,
                'buyer_id': order.buyer.id,
                'buyer_email': order.buyer.email,
                'total_price': str(order.total_price),
                'status': order.status,
            })
            return Response(OrderSerializer(order).data, status=201)
        return Response(serializer.errors, status=400)


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
            return Order.objects.filter(items__product__seller=user).distinct()
        if user.role == 'admin':
            return Order.objects.all()
        return Order.objects.none()

    def patch(self, request, *args, **kwargs):
        order = self.get_object()
        new_status = request.data.get('status')

        valid_transitions = {
            'created': ['paid', 'cancelled'],
            'paid': ['processing', 'cancelled'],
            'processing': ['shipped', 'cancelled'],
            'shipped': ['delivered'],
            'delivered': [],
            'cancelled': [],
        }

        if new_status not in valid_transitions.get(order.status, []):
            return Response(
                {'error': f'Нельзя перевести заказ из "{order.status}" в "{new_status}"'},
                status=400
            )

        order.status = new_status
        order.save()

        send_order_status_email.delay(order.id, order.buyer.email, new_status)
        publish_event('order.status_changed', {
            'order_id': order.id,
            'buyer_id': order.buyer.id,
            'status': new_status,
        })

        return Response(OrderSerializer(order).data)