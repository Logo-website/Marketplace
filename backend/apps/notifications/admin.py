from django.contrib import admin

from .models import Broadcast, Notification
from .tasks import run_broadcast


@admin.register(Broadcast)
class BroadcastAdmin(admin.ModelAdmin):
    list_display = ('title', 'segment', 'created_at', 'sent_at')
    readonly_fields = ('created_by', 'created_at', 'sent_at')
    actions = ['send_now']

    def save_model(self, request, obj, form, change):
        if not obj.created_by_id:
            obj.created_by = request.user
        super().save_model(request, obj, form, change)

    @admin.action(description='Разослать выбранным сегментам')
    def send_now(self, request, queryset):
        # Fan-out вне HTTP-ответа админки (Celery), не блокирует страницу (§5, граничный
        # случай «огромный сегмент»). Отписавшихся исключает notify() внутри задачи.
        for broadcast in queryset:
            run_broadcast.delay(broadcast.id)
        self.message_user(request, f'Запущена рассылка: {queryset.count()}')


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('recipient', 'event_type', 'category', 'is_read', 'created_at')
    list_filter = ('category', 'is_read')
    search_fields = ('recipient__email', 'title')
    readonly_fields = [f.name for f in Notification._meta.fields]

    def has_add_permission(self, request):
        # Уведомления создаёт только notify(), не руками в админке.
        return False
