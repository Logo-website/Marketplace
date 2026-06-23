from django.db import IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.products.models import Product
from apps.orders.models import Order

from . import bot
from .models import Conversation, Message
from .permissions import IsConversationParticipant
from .serializers import (
    ConversationSerializer, MessageSerializer, MessageCreateSerializer,
)
from .throttling import ChatMessageThrottle
from .delivery import deliver_message


def _conversations_for(user, role=None):
    """Диалоги пользователя. role='buyer' - где он инициатор (кабинет покупателя),
    role='seller' - где он продавец (кабинет «чаты с покупателями», 2.9), без role -
    все его диалоги + (для staff) обращения в поддержку. prefetch messages - превью
    и счётчик непрочитанных без N+1."""
    if role == 'buyer':
        cond = Q(buyer=user)
    elif role == 'seller':
        cond = Q(seller=user)
    else:
        cond = Q(buyer=user) | Q(seller=user)
        if user.is_staff:
            cond |= Q(kind=Conversation.KIND_SUPPORT)
    return (
        Conversation.objects
        .filter(cond)
        .select_related('seller', 'buyer', 'product')
        .prefetch_related('messages')
        .distinct()
    )


class ConversationListCreateView(APIView):
    """Список диалогов текущего пользователя и идемпотентный старт нового (§3.3)."""
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        role = request.query_params.get('role')
        qs = _conversations_for(request.user, role=role)
        data = ConversationSerializer(qs, many=True, context={'request': request}).data
        return Response(data)

    def post(self, request):
        kind = request.data.get('kind')
        if kind == Conversation.KIND_SUPPORT:
            return self._start_support(request)
        if kind == Conversation.KIND_SELLER:
            return self._start_seller(request)
        return Response({'error': 'Неизвестный тип диалога'}, status=400)

    def _start_support(self, request):
        # Один support-тред на покупателя (идемпотентно). Гонку ловит UniqueConstraint.
        conv = self._get_or_create(buyer=request.user, kind=Conversation.KIND_SUPPORT)
        return self._respond(request, conv)

    def _start_seller(self, request):
        seller_id = request.data.get('seller')
        from django.contrib.auth import get_user_model
        User = get_user_model()
        try:
            seller = User.objects.get(pk=seller_id, role=User.ROLE_SELLER)
        except (User.DoesNotExist, ValueError, TypeError):
            return Response({'error': 'Продавец не найден'}, status=404)
        # Нельзя завести диалог с самим собой (§5).
        if seller == request.user:
            return Response({'error': 'Нельзя начать диалог с самим собой'}, status=400)

        conv = self._get_or_create(
            buyer=request.user, seller=seller, kind=Conversation.KIND_SELLER
        )
        # Контекст товара/заказа - «последний привязанный» (Q1). Обновляем, если пришёл
        # валидный и относится к этому продавцу/покупателю (не доверяем входу вслепую).
        self._attach_context(request, conv, seller)
        return self._respond(request, conv)

    def _get_or_create(self, **keys):
        try:
            with transaction.atomic():
                conv, _ = Conversation.objects.get_or_create(**keys)
        except IntegrityError:
            # Гонка двух запросов: constraint поймал дубль - берём уже созданный.
            conv = Conversation.objects.get(**keys)
        return conv

    def _attach_context(self, request, conv, seller):
        product_id = request.data.get('product')
        order_id = request.data.get('order')
        changed = []
        if product_id:
            product = Product.objects.filter(pk=product_id, seller=seller).first()
            if product and conv.product_id != product.id:
                conv.product = product
                changed.append('product')
        if order_id:
            # Заказ-контекст только если он покупателя-инициатора (не чужой).
            order = Order.objects.filter(pk=order_id, buyer=request.user).first()
            if order and conv.order_id != order.id:
                conv.order = order
                changed.append('order')
        if changed:
            conv.save(update_fields=changed)

    def _respond(self, request, conv):
        data = ConversationSerializer(conv, context={'request': request}).data
        return Response(data, status=status.HTTP_200_OK)


class ConversationMessagesView(APIView):
    """Лента сообщений (GET, без побочек) и отправка (POST). Только участнику."""
    permission_classes = [permissions.IsAuthenticated, IsConversationParticipant]

    def get_throttles(self):
        # Троттлим только запись (POST). GET-чтение ленты под общим user-лимитом.
        if self.request.method == 'POST':
            return [ChatMessageThrottle()]
        return super().get_throttles()

    def _get_conversation(self, request, pk):
        conv = (
            Conversation.objects
            .select_related('buyer', 'seller')
            .filter(pk=pk)
            .first()
        )
        if conv is None:
            return None
        # Анти-IDOR: 404 для не-участника, чтобы не подтверждать существование чужого id.
        self.check_object_permissions(request, conv)
        return conv

    def get(self, request, pk):
        conv = self._get_conversation(request, pk)
        if conv is None:
            return Response({'error': 'Диалог не найден'}, status=404)
        msgs = conv.messages.all()
        return Response(MessageSerializer(msgs, many=True, context={'request': request}).data)

    def post(self, request, pk):
        conv = self._get_conversation(request, pk)
        if conv is None:
            return Response({'error': 'Диалог не найден'}, status=404)

        serializer = MessageCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        body = serializer.validated_data['body']

        message = Message.objects.create(
            conversation=conv, sender=request.user, body=body
        )
        # Двигаем диалог вверх в списке (updated_at - auto_now).
        conv.save(update_fields=['updated_at'])

        # Доставка адресату по WS (только адресату, §3.4). Для support-сообщения
        # покупателя живого адресата нет - бот отвечает тут же.
        deliver_message(conv, message, sender=request.user)
        bot_message = None
        if conv.kind == Conversation.KIND_SUPPORT and request.user == conv.buyer:
            bot_message = self._bot_reply(conv, body)

        out = MessageSerializer(message, context={'request': request}).data
        payload = {'message': out}
        if bot_message is not None:
            payload['bot_message'] = MessageSerializer(
                bot_message, context={'request': request}
            ).data
        return Response(payload, status=status.HTTP_201_CREATED)

    def _bot_reply(self, conv, user_text):
        # Ответ бота-заглушки (§3.5): системное сообщение, доставляется покупателю.
        answer = bot.reply_to(user_text)
        bot_message = Message.objects.create(
            conversation=conv, sender=None, is_from_bot=True, body=answer
        )
        conv.save(update_fields=['updated_at'])
        deliver_message(conv, bot_message, sender=None)
        return bot_message


class ConversationReadView(APIView):
    """Единственная точка пометки «прочитано» (§3.3): входящие -> read_at=now.
    GET ленты не мутирует - фронт дёргает это при открытии диалога."""
    permission_classes = [permissions.IsAuthenticated, IsConversationParticipant]

    def post(self, request, pk):
        conv = (
            Conversation.objects.select_related('buyer', 'seller').filter(pk=pk).first()
        )
        if conv is None:
            return Response({'error': 'Диалог не найден'}, status=404)
        self.check_object_permissions(request, conv)
        # Чужие (входящие) непрочитанные -> прочитаны. Свои сообщения не трогаем.
        updated = (
            conv.messages
            .filter(read_at__isnull=True)
            .exclude(sender=request.user)
            .update(read_at=timezone.now())
        )
        return Response({'marked_read': updated})
