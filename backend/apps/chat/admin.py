from django.contrib import admin

from .models import Conversation, Message


class MessageInline(admin.TabularInline):
    model = Message
    extra = 0
    readonly_fields = ['sender', 'is_from_bot', 'created_at', 'read_at']


@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    """Оператор поддержки (staff) ведёт support-обращения здесь (§3.5) - отдельного
    пульта в скоупе Ф24 нет."""
    list_display = ['id', 'kind', 'buyer', 'seller', 'updated_at']
    list_filter = ['kind']
    search_fields = ['buyer__username', 'seller__username']
    inlines = [MessageInline]


@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ['id', 'conversation', 'sender', 'is_from_bot', 'created_at', 'read_at']
    list_filter = ['is_from_bot']
