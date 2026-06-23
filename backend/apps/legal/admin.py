from django.contrib import admin

from .models import LegalDocument, Receipt


@admin.register(LegalDocument)
class LegalDocumentAdmin(admin.ModelAdmin):
    """Редактор юр-документов (паттерн Ф19 - контент через стандартную админку).
    Текст/версию/дату/публикацию владелец правит без передеплоя."""
    list_display = ['slug', 'title', 'version', 'effective_date', 'is_published', 'updated_at']
    list_filter = ['is_published']
    search_fields = ['slug', 'title']
    prepopulated_fields = {'slug': ('title',)}


@admin.register(Receipt)
class ReceiptAdmin(admin.ModelAdmin):
    """Чек 54-ФЗ - ЭМУЛЯЦИЯ, read-only: реквизиты генерируются из заказа,
    править/создавать вручную нечего (§8)."""
    list_display = ['id', 'order', 'fn_number', 'fd_number', 'total', 'is_emulated', 'created_at']
    readonly_fields = ['order', 'fn_number', 'fd_number', 'fiscal_sign', 'total', 'is_emulated', 'created_at']

    def has_add_permission(self, request):
        return False
