from django.urls import path

from .views import (
    MarkAllReadView, MarkReadView, NotificationListView, UnreadCountView,
    UnsubscribeView,
)

urlpatterns = [
    path('', NotificationListView.as_view(), name='notification-list'),
    # Литеральные сегменты - до <int:pk>/read/ (int-конвертер их и так не съест,
    # но порядок оставляем явным).
    path('unread-count/', UnreadCountView.as_view(), name='notification-unread-count'),
    path('read-all/', MarkAllReadView.as_view(), name='notification-read-all'),
    path('unsubscribe/<str:token>/', UnsubscribeView.as_view(), name='notification-unsubscribe'),
    path('<int:pk>/read/', MarkReadView.as_view(), name='notification-read'),
]
