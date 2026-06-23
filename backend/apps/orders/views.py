import logging
from django.db import transaction
from django.db.models import Exists, OuterRef
from rest_framework import generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Order, OrderItem
from .serializers import OrderSerializer, OrderCreateSerializer, SellerOrderSerializer
from apps.permissions import IsSellerOrAdmin
from apps.cart.cart import get_cart, clear_cart, remove_keys, cart_key, parse_cart_key
from apps.products.models import Product
from apps.notifications.services import notify
from services.clickhouse_service import ClickHouseService

logger = logging.getLogger(__name__)


def validate_cart_items(cart):
    """
    Валидирует товары из корзины.
    Возвращает (items, errors) — список позиций и список ошибок по позициям.
    """
    items = []
    errors = []

    for key, quantity in cart.items():
        # Составной ключ Ф8 (product_id|size|color). int(key) на нём бросил бы
        # ValueError - разбираем через parse_cart_key.
        try:
            product_id, size, color = parse_cart_key(key)
        except (ValueError, TypeError):
            errors.append({'product_id': key, 'error': 'Некорректная позиция в корзине'})
            continue
        try:
            product = Product.objects.select_for_update().get(
                id=product_id, status='active'
            )
            if product.stock < quantity:
                errors.append({
                    'product_id': product_id,
                    'error': f'Недостаточно товара "{product.name}": в наличии {product.stock}, в корзине {quantity}'
                })
            else:
                items.append({
                    'key': key,
                    'product': product,
                    'quantity': quantity,
                    'price': product.price,
                    'size': size,
                    'color': color,
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
    total = str(order.total_price)
    product_ids = [item.product_id for item in order.items.all() if item.product_id]

    def dispatch():
        try:
            # Единое письмо + лента + живой колокольчик через центр уведомлений (Ф25).
            # category='order' - транзакционное, доходит всегда. notify сам ставит
            # e-mail/WS через on_commit (здесь мы уже после коммита заказа).
            notify(order.buyer, 'order.created', {'order_id': order_id, 'total': total},
                   category='order')
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

        # Способ доставки/оплаты (Ф9) - валидируем по набору choices, чтобы в заказ
        # не попал мусор с фронта. Не передан -> дефолт модели (pickup/card).
        delivery_method = request.data.get('delivery_method', Order.DELIVERY_PICKUP)
        if delivery_method not in dict(Order.DELIVERY_CHOICES):
            return Response({'error': 'Недопустимый способ доставки'}, status=400)
        payment_method = request.data.get('payment_method', Order.PAYMENT_CARD)
        if payment_method not in dict(Order.PAYMENT_CHOICES):
            return Response({'error': 'Недопустимый способ оплаты'}, status=400)

        # Честный выбор позиций (Ф8 этап 5): если переданы выбранные позиции -
        # оформляем только их, остальное остаётся в корзине. Без items - вся
        # корзина (обратная совместимость со старым контрактом).
        selected = request.data.get('items')
        if selected:
            wanted = set()
            for it in selected:
                try:
                    wanted.add(cart_key(
                        it.get('product_id'), it.get('size', '') or '', it.get('color', '') or ''
                    ))
                except (TypeError, ValueError):
                    continue
            cart = {k: v for k, v in cart.items() if k in wanted}
            if not cart:
                return Response({'error': 'Выберите товары для оформления'}, status=400)

        with transaction.atomic():
            items, errors = validate_cart_items(cart)

            if errors:
                return Response({'errors': errors}, status=400)

            total_price = sum(i['price'] * i['quantity'] for i in items)

            order = Order.objects.create(
                buyer=request.user,
                delivery_address=delivery_address,
                # (… or '') - клиент может прислать null: get(default) сработает
                # только при отсутствии ключа, а None.strip() уронил бы в 500.
                recipient_name=(request.data.get('recipient_name') or '').strip(),
                recipient_phone=(request.data.get('recipient_phone') or '').strip(),
                recipient_email=(request.data.get('recipient_email') or '').strip(),
                delivery_method=delivery_method,
                payment_method=payment_method,
                comment=request.data.get('comment', ''),
                total_price=total_price,
            )

            for i in items:
                OrderItem.objects.create(
                    order=order,
                    product=i['product'],
                    product_name=i['product'].name,
                    size=i['size'],
                    color=i['color'],
                    quantity=i['quantity'],
                    price_at_purchase=i['price'],
                )
                # Уменьшаем остатки
                Product.objects.filter(pk=i['product'].pk).update(
                    stock=i['product'].stock - i['quantity']
                )

        # Чистим только оформленные позиции, не всю корзину - невыбранное
        # остаётся (Ф8 этап 5, граничный случай плана).
        remove_keys(request.user.id, [i['key'] for i in items])
        on_order_created(order)

        return Response(OrderSerializer(order).data, status=201)


class OrderDetailView(generics.RetrieveAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Order.objects.filter(buyer=self.request.user)


class _SellerOrderBase:
    """
    Общая база seller-эндпоинтов (Ф14): сериализатор, доступ, queryset и контекст.

    Queryset - заказы, содержащие ХОТЯ БЫ ОДНУ позицию продавца (включая
    смешанные: ему нужно собрать свою часть). Доступ - только seller/admin;
    чужой заказ не в queryset -> detail отдаёт 404 (план 4.1, часть 9).
    """
    serializer_class = SellerOrderSerializer
    permission_classes = [IsSellerOrAdmin]

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['seller'] = self.request.user
        return ctx

    def get_queryset(self):
        return (
            Order.objects
            .filter(items__product__seller=self.request.user)
            .distinct()
            .prefetch_related('items__product')
        )


class SellerOrderListView(_SellerOrderBase, generics.ListAPIView):
    def get_queryset(self):
        qs = super().get_queryset()
        # Фильтр по статусу заказа (план 4.1). Несуществующий статус -> пустой
        # список, не 500 (filter не валидирует значение - граничный случай §6).
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs


class SellerOrderDetailView(_SellerOrderBase, generics.RetrieveAPIView):
    pass


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

        # Лента + одно письмо + живой колокольчик через центр (Ф25).
        notify(order.buyer, f'order.{new_status}', {'order_id': order.id},
               category='order')

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

        # Лента + одно письмо + живой колокольчик через центр (Ф25).
        notify(order.buyer, 'order.cancelled', {'order_id': order.id}, category='order')

        return Response(OrderSerializer(order).data)