from django.core import signing
from django.shortcuts import get_object_or_404
from rest_framework import generics, permissions
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Notification
from .serializers import NotificationSerializer
from .services import read_unsubscribe_token

# Ключи маркетинговых каналов в User.notification_prefs (Ф10), которые гасит отписка.
MARKETING_PREF_KEYS = ['promos_email', 'promos_push']


class NotificationListView(generics.ListAPIView):
    """Лента текущего пользователя (изоляция получателя, §8): queryset строго по
    request.user - чужие уведомления не видны."""
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Notification.objects.filter(recipient=self.request.user)


class UnreadCountView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        count = Notification.objects.filter(recipient=request.user, is_read=False).count()
        return Response({'count': count})


class MarkReadView(APIView):
    """Пометить одно уведомление прочитанным. Чужой/несуществующий id -> 404
    (не чужая лента, §8): get_object_or_404 фильтрует по recipient."""
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request, pk):
        notification = get_object_or_404(Notification, pk=pk, recipient=request.user)
        if not notification.is_read:
            notification.is_read = True
            notification.save(update_fields=['is_read'])
        return Response(NotificationSerializer(notification).data)


class MarkAllReadView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        updated = Notification.objects.filter(
            recipient=request.user, is_read=False
        ).update(is_read=True)
        return Response({'marked': updated})


class UnsubscribeView(APIView):
    """One-click отписка из письма по подписанному токену (§4.4). Публичная, но
    безопасная: токен подписан SECRET_KEY и несёт только свой user_id - отписать
    другого или перебрать id нельзя. Идемпотентна. Гасит только маркетинговые каналы;
    транзакционные (статус заказа) не трогаются."""
    permission_classes = [permissions.AllowAny]
    authentication_classes = []

    def get(self, request, token):
        from django.contrib.auth import get_user_model
        try:
            user_id = read_unsubscribe_token(token)
        except signing.BadSignature:
            return Response({'error': 'Ссылка недействительна или устарела'}, status=400)

        User = get_user_model()
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'Ссылка недействительна'}, status=400)

        prefs = dict(user.notification_prefs or {})
        for key in MARKETING_PREF_KEYS:
            prefs[key] = False
        user.notification_prefs = prefs
        user.save(update_fields=['notification_prefs'])
        return Response({'detail': 'Вы отписались от маркетинговых рассылок'})
