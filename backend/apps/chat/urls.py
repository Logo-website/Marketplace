from django.urls import path

from .views import (
    ConversationListCreateView, ConversationMessagesView, ConversationReadView,
)

urlpatterns = [
    path('conversations/', ConversationListCreateView.as_view(), name='chat-conversations'),
    path(
        'conversations/<int:pk>/messages/',
        ConversationMessagesView.as_view(), name='chat-messages',
    ),
    path(
        'conversations/<int:pk>/read/',
        ConversationReadView.as_view(), name='chat-read',
    ),
]
