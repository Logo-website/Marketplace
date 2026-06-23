from django.contrib import admin, messages
from django.contrib.auth.admin import UserAdmin
from .models import User, SellerProfile


def _last_active_admin(exclude_pks):
    """Останется ли хоть один активный админ, если исключить exclude_pks.
    Защита админ-контура: нельзя оставить площадку без управления (Ф19, §9)."""
    return not User.objects.filter(
        role=User.ROLE_ADMIN, is_active=True
    ).exclude(pk__in=exclude_pks).exists()


@admin.action(description='Заблокировать выбранных')
def block_users(modeladmin, request, queryset):
    """Массовая блокировка через is_active (SimpleJWT отклонит и логин, и старый
    токен). Защиты: нельзя выключить себя и последнего активного админа."""
    if queryset.filter(pk=request.user.pk).exists():
        modeladmin.message_user(
            request, 'Нельзя заблокировать собственный аккаунт', messages.ERROR
        )
        return
    blocking_admins = list(
        queryset.filter(role=User.ROLE_ADMIN, is_active=True).values_list('pk', flat=True)
    )
    if blocking_admins and _last_active_admin(blocking_admins):
        modeladmin.message_user(
            request, 'Нельзя заблокировать последнего активного администратора',
            messages.ERROR,
        )
        return
    updated = queryset.update(is_active=False)
    modeladmin.message_user(request, f'Заблокировано: {updated}', messages.SUCCESS)


@admin.action(description='Разблокировать выбранных')
def unblock_users(modeladmin, request, queryset):
    """Разблокировка безопасна (возвращает доступ) - без защит."""
    updated = queryset.update(is_active=True)
    modeladmin.message_user(request, f'Разблокировано: {updated}', messages.SUCCESS)


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    list_display = ['email', 'username', 'role', 'is_active']
    list_filter = ['role', 'is_active']
    search_fields = ['email', 'username']
    actions = [block_users, unblock_users]
    fieldsets = UserAdmin.fieldsets + (
        ('Роль', {'fields': ('role', 'phone', 'avatar')}),
    )

    def save_model(self, request, obj, form, change):
        """Те же защиты для правки через форму (actions их обходят update()'ом):
        нельзя деактивировать себя и нельзя снять права (демоушен/деактивация) у
        последнего активного админа - иначе площадка теряет управление (Ф19, §9)."""
        if change:
            if obj.pk == request.user.pk and not obj.is_active:
                self.message_user(
                    request, 'Нельзя деактивировать собственный аккаунт', messages.ERROR
                )
                return
            old = User.objects.filter(pk=obj.pk).first()
            if old and old.role == User.ROLE_ADMIN and old.is_active:
                loses_admin = obj.role != User.ROLE_ADMIN or not obj.is_active
                if loses_admin and _last_active_admin([obj.pk]):
                    self.message_user(
                        request,
                        'Нельзя снять права у последнего активного администратора',
                        messages.ERROR,
                    )
                    return
        super().save_model(request, obj, form, change)


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
