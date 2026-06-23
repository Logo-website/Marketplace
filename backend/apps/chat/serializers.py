from rest_framework import serializers

from .models import Conversation, Message


class MessageSerializer(serializers.ModelSerializer):
    """Сообщение для ленты диалога. Отдаём sender_id (id - не PII) и is_mine -
    фронт рисует «своё/чужое» без знания имён. Тело - плейн-текст, экранирует фронт."""
    is_mine = serializers.SerializerMethodField()

    class Meta:
        model = Message
        fields = ['id', 'body', 'is_from_bot', 'sender_id', 'is_mine', 'created_at', 'read_at']

    def get_is_mine(self, obj):
        request = self.context.get('request')
        return bool(request and obj.sender_id == request.user.id)


class MessageCreateSerializer(serializers.Serializer):
    """Валидация входящего сообщения: не пустое (после strip), длина ограничена.
    Отдельный сериализатор - запись не должна принимать sender/read_at от клиента."""
    body = serializers.CharField(max_length=4000, trim_whitespace=True, allow_blank=False)


class ConversationSerializer(serializers.ModelSerializer):
    """Диалог в списке: имя контрагента - shop_name/username (НЕ email/phone, §8/S17),
    превью последнего сообщения, счётчик непрочитанных. Контекст товара - название/id."""
    title = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    product_title = serializers.SerializerMethodField()
    kind_display = serializers.CharField(source='get_kind_display', read_only=True)

    class Meta:
        model = Conversation
        fields = [
            'id', 'kind', 'kind_display', 'title', 'product_id', 'product_title',
            'order_id', 'last_message', 'unread_count', 'updated_at',
        ]

    def _viewer(self):
        request = self.context.get('request')
        return request.user if request else None

    def get_title(self, obj):
        # Имя второго участника глазами текущего пользователя. Без PII.
        if obj.kind == Conversation.KIND_SUPPORT:
            return 'Поддержка площадки'
        viewer = self._viewer()
        other = obj.other_participant(viewer) if viewer else obj.seller
        if other is None:
            return 'Магазин'
        return other.shop_name or other.username

    def get_product_title(self, obj):
        return obj.product.title if obj.product_id else None

    def get_last_message(self, obj):
        # messages приходят из prefetch (view), берём последнее по created_at.
        msgs = list(obj.messages.all())
        if not msgs:
            return None
        last = msgs[-1]
        return {
            'body': last.body[:120],
            'created_at': last.created_at,
            'is_from_bot': last.is_from_bot,
        }

    def get_unread_count(self, obj):
        # Входящие непрочитанные относительно текущего пользователя (из prefetch,
        # без доп. запроса). Бот/контрагент - чужие; свои не считаем.
        viewer = self._viewer()
        viewer_id = viewer.id if viewer else None
        return sum(
            1 for m in obj.messages.all()
            if m.read_at is None and m.sender_id != viewer_id
        )
