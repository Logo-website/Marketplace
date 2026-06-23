from django.contrib import admin
from .models import Order, OrderItem


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