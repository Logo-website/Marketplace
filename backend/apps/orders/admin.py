from django.contrib import admin, messages
from .models import Order, OrderItem, ReturnRequest, ReturnItem


class OrderItemInline(admin.TabularInline):
    model = OrderItem
    extra = 0
    readonly_fields = ['price_at_purchase']


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = ['id', 'buyer', 'status', 'total_price', 'created_at']
    list_filter = ['status', 'created_at']
    # =id - точный поиск по номеру заказа (без него '5' искал бы и подстроку);
    # buyer__email - поиск по покупателю.
    search_fields = ['=id', 'buyer__email']
    # Снимковые поля заказа - только чтение: цена/дата фиксируются при оформлении
    # (Ф9), руками их не правим.
    readonly_fields = ['total_price', 'created_at']
    # N+1: список тянет buyer одним JOIN, а не запросом на строку.
    list_select_related = ['buyer']
    inlines = [OrderItemInline]
    # «Спорные ситуации» из узла 3.4 (возвраты/арбитраж) - НЕ здесь, это Ф23.
    # Ф19 даёт реестру только просмотр/поиск; логика переходов статуса - Ф14.


class ReturnItemInline(admin.TabularInline):
    model = ReturnItem
    extra = 0
    # Позиции возврата read-only: состав заявки фиксируется при создании,
    # арбитр меняет только статус/комментарий, не переписывает позиции.
    readonly_fields = ['order_item', 'quantity']
    can_delete = False


@admin.register(ReturnRequest)
class ReturnRequestAdmin(admin.ModelAdmin):
    """Арбитраж спорных возвратов (Ф23, узел 3.9): админ разбирает disputed и
    выносит ФИНАЛЬНОЕ решение (approve/reject), ставя arbitrated=True (§4.2)."""
    list_display = ['id', 'order', 'buyer', 'seller', 'status', 'refund_amount', 'arbitrated', 'created_at']
    list_filter = ['status', 'arbitrated', 'created_at']
    search_fields = ['=id', '=order__id', 'buyer__email', 'seller__email']
    # Снимковые/денорм. поля - только чтение: меняем лишь статус и комментарий.
    readonly_fields = ['order', 'buyer', 'seller', 'reason', 'reason_text', 'method',
                       'photo', 'refund_amount', 'created_at']
    list_select_related = ['order', 'buyer', 'seller']
    inlines = [ReturnItemInline]
    actions = ['arbitrate_approve', 'arbitrate_reject']

    def _arbitrate(self, request, queryset, decision):
        # Арбитраж применим ТОЛЬКО к спорным (disputed): иначе админ обходил бы
        # машину статусов (например, refunded->approved). Решение финально.
        done, skipped = 0, 0
        for req in queryset:
            if req.status != ReturnRequest.STATUS_DISPUTED:
                skipped += 1
                continue
            req.status = decision
            req.arbitrated = True
            req.save(update_fields=['status', 'arbitrated', 'updated_at'])
            # Уведомляем покупателя о решении (тот же центр Ф25, что и продавец).
            from .views import notify_return_status
            notify_return_status(req, decision)
            done += 1
        if done:
            self.message_user(request, f'Решено заявок: {done}', messages.SUCCESS)
        if skipped:
            self.message_user(
                request, f'Пропущено (не в споре): {skipped}', messages.WARNING
            )

    @admin.action(description='Арбитраж: одобрить возврат (спорные)')
    def arbitrate_approve(self, request, queryset):
        self._arbitrate(request, queryset, ReturnRequest.STATUS_APPROVED)

    @admin.action(description='Арбитраж: отклонить возврат (спорные)')
    def arbitrate_reject(self, request, queryset):
        self._arbitrate(request, queryset, ReturnRequest.STATUS_REJECTED)