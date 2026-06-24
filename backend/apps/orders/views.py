import json
import logging
from datetime import timedelta
from django.conf import settings
from django.db import transaction
from django.db.models import Exists, OuterRef, Q
from django.utils import timezone
from rest_framework import generics, permissions
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Order, OrderItem, ReturnRequest, ReturnItem
from .serializers import (
    OrderSerializer, SellerOrderSerializer,
    ReturnRequestSerializer, SellerReturnSerializer,
)
from apps.permissions import IsSellerOrAdmin
from apps.cart.cart import get_cart, clear_cart, remove_keys, cart_key, parse_cart_key
from apps.products.models import Product
from apps.notifications.services import notify
from apps.legal.services import generate_receipt
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

    # Чек 54-ФЗ (Ф26, §4.5) - СИНХРОННО, до on_commit-dispatch: чек должен попасть
    # в ответ (экран «спасибо» показывает его сразу), а on_commit-callback отработал
    # бы уже после сериализации ответа. Идемпотентно (get_or_create), реальной
    # оплаты нет - чек привязан к созданию заказа (карта 4.5). Сбой генерации не
    # должен ронять заказ - заказ важнее чека (§5).
    try:
        generate_receipt(order)
    except Exception as e:
        logger.error(f'generate_receipt error for order {order_id}: {e}')

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


# Только список заказов покупателя. Создание заказа идёт ИСКЛЮЧИТЕЛЬНО через
# OrderFromCartView (/orders/from-cart/), где стоит guard согласия 54-ФЗ. Прямой
# POST /orders/ закрыт (стресс-тест №5): открытый create в обход гарда был мёртвым
# путём (фронт им не пользуется) - метод убран, POST теперь 405.
class OrderListCreateView(generics.ListAPIView):
    serializer_class = OrderSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Order.objects.filter(buyer=self.request.user).prefetch_related('items')


class OrderFromCartView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        cart = get_cart(request.user.id)
        if not cart:
            return Response({'error': 'Корзина пуста'}, status=400)

        # Согласие с офертой/политикой (Ф26, §4.6) - дословный критерий карты «без
        # них нельзя принимать оплату». Серверный guard на пути оформления (UX оплаты):
        # без подтверждения заказ не создаётся. Сам факт согласия не храним
        # (минимизация ПДн, §11 в.3) - проверяем флаг запроса.
        if not request.data.get('accept_offer'):
            return Response(
                {'error': 'Подтвердите согласие с офертой и политикой конфиденциальности'},
                status=400,
            )

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

        # Длина полей получателя/доставки (стресс-тест №2/№8). Order.objects.create
        # пишет в БД без full_clean, поэтому строка сверх varchar-капа уронила бы
        # Postgres «value too long» -> 500 и откат транзакции. Проверяем длину
        # заранее -> понятный 400. Капы получателя совпадают с моделью (name=200,
        # phone=20, email=254); address/comment - TextField без DB-границы, ставим
        # product-лимит, чтобы нельзя было записать гигабайт. (… or '') - клиент
        # может прислать null: len(None) уронил бы в 500.
        recipient_name = (request.data.get('recipient_name') or '').strip()
        recipient_phone = (request.data.get('recipient_phone') or '').strip()
        recipient_email = (request.data.get('recipient_email') or '').strip()
        comment = request.data.get('comment') or ''
        for label, value, cap in (
            ('Имя получателя', recipient_name, 200),
            ('Телефон', recipient_phone, 20),
            ('E-mail', recipient_email, 254),
            ('Адрес доставки', delivery_address, 500),
            ('Комментарий', comment, 1000),
        ):
            if len(value) > cap:
                return Response(
                    {'error': f'{label}: слишком длинное значение (максимум {cap} символов)'},
                    status=400,
                )

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
                # recipient_*/comment уже нормализованы и проверены по длине выше.
                recipient_name=recipient_name,
                recipient_phone=recipient_phone,
                recipient_email=recipient_email,
                delivery_method=delivery_method,
                payment_method=payment_method,
                comment=comment,
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
        elif new_status == 'delivered':
            # Фиксируем момент доставки - от него Ф23 отсчитывает срок возврата.
            order.status = new_status
            order.delivered_at = timezone.now()
            order.save(update_fields=['status', 'delivered_at', 'updated_at'])
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


# ------------------- Возвраты (Ф23) -------------------

def notify_return_status(return_request, status):
    """Уведомление покупателю о смене статуса возврата через центр (Ф25).

    Возврат - транзакционная категория (человек обязан узнать решение по заявке),
    e-mail/лента/колокольчик собирает notify() сам через on_commit (S8). Богатые
    каналы - уже в Ф25, тут просто переиспользуем центр, не свою Celery-задачу.
    """
    notify(
        return_request.buyer, f'return.{status}',
        {'return_id': return_request.id, 'order_id': return_request.order_id},
        category='order',
    )


class ReturnListCreateView(APIView):
    """Покупатель: создать заявку на возврат и посмотреть свои возвраты (1.14).

    Создание сделано в APIView вручную (как OrderFromCartView), а не nested-
    сериализатором: позиции приходят списком, фото - файлом (multipart), валидаций
    много (свой+delivered+срок+один продавец+кол-во+не повтор) - явный код читаемее.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        qs = (
            ReturnRequest.objects
            .filter(buyer=request.user)
            .prefetch_related('items__order_item')
        )
        return Response(ReturnRequestSerializer(qs, many=True).data)

    def post(self, request):
        # 1. Заказ - свой и доставленный (паттерн «если купил» + развязка с Ф9).
        try:
            order = Order.objects.get(pk=request.data.get('order'), buyer=request.user)
        except (Order.DoesNotExist, ValueError, TypeError):
            return Response({'error': 'Заказ не найден'}, status=404)
        if order.status != Order.STATUS_DELIVERED:
            return Response(
                {'error': 'Возврат доступен только для доставленных заказов'}, status=400
            )

        # 2. Срок возврата (settings.RETURN_PERIOD_DAYS дней с даты доставки).
        within_period = (
            order.delivered_at is not None
            and timezone.now() - order.delivered_at <= timedelta(days=settings.RETURN_PERIOD_DAYS)
        )
        if not within_period:
            return Response(
                {'error': f'Срок возврата ({settings.RETURN_PERIOD_DAYS} дней) истёк'}, status=400
            )

        # 3. Причина/способ - из набора choices (мусор с фронта не пропускаем).
        reason = request.data.get('reason')
        if reason not in dict(ReturnRequest.REASON_CHOICES):
            return Response({'error': 'Укажите причину возврата'}, status=400)
        method = request.data.get('method', ReturnRequest.METHOD_PICKUP)
        if method not in dict(ReturnRequest.METHOD_CHOICES):
            return Response({'error': 'Недопустимый способ возврата'}, status=400)
        # UGC: ограничиваем длину, чтобы не положить хранилище; показ как текст (§8).
        reason_text = (request.data.get('reason_text') or '').strip()[:2000]

        # 4. Позиции: список или JSON-строка (multipart c фото).
        raw_items = request.data.get('items')
        if isinstance(raw_items, str):
            try:
                raw_items = json.loads(raw_items)
            except ValueError:
                raw_items = None
        if not raw_items or not isinstance(raw_items, list):
            return Response({'error': 'Выберите позиции для возврата'}, status=400)

        order_items = {oi.id: oi for oi in order.items.select_related('product')}
        seller_ids = set()
        validated = []
        for it in raw_items:
            try:
                oi_id = int(it.get('order_item'))
                qty = int(it.get('quantity', 1))
            except (TypeError, ValueError, AttributeError):
                return Response({'error': 'Некорректная позиция возврата'}, status=400)
            oi = order_items.get(oi_id)
            if oi is None:
                return Response({'error': 'Позиция не из этого заказа'}, status=400)
            if qty < 1 or qty > oi.quantity:
                return Response(
                    {'error': f'Количество к возврату должно быть от 1 до {oi.quantity}'}, status=400
                )
            # Удалённый товар: продавца не определить (нет product), заявку не заводим.
            if oi.product is None:
                return Response(
                    {'error': 'Товар снят с продажи, оформить возврат нельзя'}, status=400
                )
            seller_ids.add(oi.product.seller_id)
            validated.append((oi, qty))

        # 5. Мультивендор (S4): одна заявка - один продавец.
        if len(seller_ids) != 1:
            return Response(
                {'error': 'Возврат оформляется по товарам одного продавца - разделите на отдельные заявки'},
                status=400,
            )

        # 6. Нельзя дважды вернуть один товар (есть активная заявка по позиции).
        oi_ids = [oi.id for oi, _ in validated]
        has_active = ReturnItem.objects.filter(
            order_item_id__in=oi_ids,
            return_request__status__in=ReturnRequest.ACTIVE_STATUSES,
        ).exists()
        if has_active:
            return Response(
                {'error': 'По одной из позиций уже есть активная заявка на возврат'}, status=409
            )

        with transaction.atomic():
            req = ReturnRequest.objects.create(
                order=order, buyer=request.user, seller_id=seller_ids.pop(),
                reason=reason, reason_text=reason_text, method=method,
                photo=request.FILES.get('photo'),
            )
            for oi, qty in validated:
                ReturnItem.objects.create(return_request=req, order_item=oi, quantity=qty)
            # refund_amount - сумма snapshot-цен позиций (эмуляция; реальные деньги Ф30).
            req.refund_amount = req.compute_refund_amount()
            req.save(update_fields=['refund_amount'])

        return Response(ReturnRequestSerializer(req).data, status=201)


class ReturnDetailView(generics.RetrieveAPIView):
    """Деталь возврата: владелец-покупатель / владелец-продавец / админ.
    Сериализатор без PII любой стороны - чужой email/phone не утекает (§8)."""
    serializer_class = ReturnRequestSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        qs = ReturnRequest.objects.prefetch_related('items__order_item')
        if user.role == 'admin':
            return qs
        return qs.filter(Q(buyer=user) | Q(seller=user))


class ReturnDisputeView(APIView):
    """Покупатель оспаривает ОТКАЗ продавца (rejected -> disputed, §4.2)."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        try:
            req = ReturnRequest.objects.get(pk=pk, buyer=request.user)
        except ReturnRequest.DoesNotExist:
            return Response({'error': 'Заявка не найдена'}, status=404)
        # Спор - только из состоявшегося отказа (из requested спорить нечего).
        if req.status != ReturnRequest.STATUS_REJECTED:
            return Response({'error': 'Оспорить можно только отклонённую заявку'}, status=400)
        # Решение арбитра финально - повторный спор запрещён (§4.2).
        if req.arbitrated:
            return Response({'error': 'Решение по спору окончательное'}, status=409)
        req.status = ReturnRequest.STATUS_DISPUTED
        req.save(update_fields=['status', 'updated_at'])
        return Response(ReturnRequestSerializer(req).data)


class SellerReturnListView(generics.ListAPIView):
    """Продавец: заявки на ЕГО товары (S4 - по денорм. seller). Чужие не видны."""
    serializer_class = SellerReturnSerializer
    permission_classes = [IsSellerOrAdmin]

    def get_queryset(self):
        qs = (
            ReturnRequest.objects
            .filter(seller=self.request.user)
            .select_related('order', 'buyer')
            .prefetch_related('items__order_item')
        )
        status_param = self.request.query_params.get('status')
        if status_param:
            qs = qs.filter(status=status_param)
        return qs


class SellerReturnUpdateView(APIView):
    """Продавец ведёт заявку по машине статусов (§4.2): принять/отклонить, приёмка
    (восстановление стока), refund (эмуляция возврата денег). Только свои (S4)."""
    permission_classes = [IsSellerOrAdmin]

    # Переходы, доступные продавцу. Спор (rejected->disputed) - покупатель;
    # арбитраж (disputed->...) - админ. Их продавцу нельзя.
    SELLER_TRANSITIONS = {
        ReturnRequest.STATUS_REQUESTED: [ReturnRequest.STATUS_APPROVED, ReturnRequest.STATUS_REJECTED],
        ReturnRequest.STATUS_APPROVED: [ReturnRequest.STATUS_RECEIVED],
        ReturnRequest.STATUS_RECEIVED: [ReturnRequest.STATUS_REFUNDED],
    }

    def patch(self, request, pk):
        try:
            req = ReturnRequest.objects.get(pk=pk, seller=request.user)
        except ReturnRequest.DoesNotExist:
            return Response({'error': 'Заявка не найдена'}, status=404)

        new_status = request.data.get('status')
        if new_status not in self.SELLER_TRANSITIONS.get(req.status, []):
            return Response(
                {'error': f'Нельзя перевести возврат из "{req.status}" в "{new_status}"'},
                status=400,
            )

        if new_status == ReturnRequest.STATUS_RECEIVED:
            # Приёмка восстанавливает сток атомарно и идемпотентно (двойной клик
            # не удвоит сток - guard по статусу внутри receive()).
            if not req.receive():
                return Response({'error': 'Возврат уже принят'}, status=400)
        else:
            if new_status == ReturnRequest.STATUS_REJECTED:
                comment = (request.data.get('resolution_comment') or '').strip()[:2000]
                if comment:
                    req.resolution_comment = comment
            req.status = new_status
            req.save()

        notify_return_status(req, new_status)
        return Response(SellerReturnSerializer(req).data)