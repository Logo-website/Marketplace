from rest_framework.permissions import BasePermission

from .models import Conversation


class IsConversationParticipant(BasePermission):
    """Анти-IDOR (§8, главное): доступ к диалогу и его сообщениям - ТОЛЬКО участнику.

    Участник seller-треда - buyer или seller. Для support-треда контрагент-площадка =
    staff (оператор видит обращения в поддержку). Чужой conversation_id -> 403, переписка
    не утекает. Работает на уровне объекта (has_object_permission), вьюхи зовут
    check_object_permissions явно после get_object.
    """
    message = 'Нет доступа к этому диалогу.'

    def has_object_permission(self, request, view, obj):
        user = request.user
        if not user.is_authenticated:
            return False
        if user == obj.buyer:
            return True
        if obj.kind == Conversation.KIND_SELLER:
            return user == obj.seller
        # support-тред: контрагент - площадка, отвечает оператор-staff.
        return user.is_staff
