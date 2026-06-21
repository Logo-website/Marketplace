from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User, SellerProfile


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ['email', 'username', 'role', 'is_active']
    list_filter = ['role', 'is_active']
    search_fields = ['email', 'username']
    fieldsets = UserAdmin.fieldsets + (
        ('Роль', {'fields': ('role', 'phone', 'avatar')}),
    )


@admin.register(SellerProfile)
class SellerProfileAdmin(admin.ModelAdmin):
    """Read-only просмотр заявок продавцов (Ф11). Активация - серверный
    инвариант по полноте комплекта, руками статус не правим."""
    list_display = ['user', 'legal_status', 'tariff', 'status', 'created_at']
    list_filter = ['status', 'legal_status', 'tariff']
    search_fields = ['user__email', 'legal_name', 'inn']

    def has_add_permission(self, request):
        return False

    def get_readonly_fields(self, request, obj=None):
        return [f.name for f in self.model._meta.fields]
