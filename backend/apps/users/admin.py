from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ['email', 'username', 'role', 'is_active']
    list_filter = ['role', 'is_active']
    search_fields = ['email', 'username']
    fieldsets = UserAdmin.fieldsets + (
        ('Роль', {'fields': ('role', 'phone', 'avatar')}),
    )
