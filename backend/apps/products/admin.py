from django.contrib import admin, messages
from django.shortcuts import render
from .models import (
    Answer, Category, Look, LookItem, Product, ProductImage, Question, Report, Review,
)
from .moderation import approve as approve_product, reject as reject_product, ModerationError
from .serializers import REJECTION_REASON_MAX


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1


@admin.action(description='Скрыть выбранные (из каталога)')
def hide_categories(modeladmin, request, queryset):
    """Скрытие категории из каталога Ф2 без удаления (Ф19, узел 3.5). Товары не
    теряются - это не удаление с CASCADE."""
    updated = queryset.update(is_visible=False)
    modeladmin.message_user(request, f'Скрыто: {updated}', messages.SUCCESS)


@admin.action(description='Показать выбранные (в каталоге)')
def show_categories(modeladmin, request, queryset):
    updated = queryset.update(is_visible=True)
    modeladmin.message_user(request, f'Показано: {updated}', messages.SUCCESS)


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    # parent в списке = читаемое дерево без django-mptt (учебный объём категорий
    # этого не требует - новая зависимость была бы scope creep).
    list_display = ['name', 'slug', 'parent', 'is_visible']
    list_filter = ['is_visible']
    prepopulated_fields = {'slug': ('name',)}
    actions = [hide_categories, show_categories]
    # Бренды (модель Brand) - Ф20/Ф21, атрибуты/фильтры/размерные сетки категории -
    # Ф5/Ф2: в Ф19 не делаются (план §3.2, §3.3, §7).


@admin.action(description='Одобрить выбранные (на модерации)')
def approve_moderation(modeladmin, request, queryset):
    """Фоллбэк модерации (Ф17, Вариант B): тот же сервис, что и REST-вьюхи -
    ES-переиндексация + аудит, а не голый дропдаун статуса. Не-moderation
    товары пропускаются (валидация статуса в сервисе)."""
    done = 0
    for product in queryset:
        try:
            approve_product(product, request.user)
            done += 1
        except ModerationError:
            continue
    modeladmin.message_user(
        request, f'Одобрено и опубликовано: {done}', messages.SUCCESS
    )


@admin.action(description='Отклонить с причиной (на модерации)')
def reject_moderation(modeladmin, request, queryset):
    """Отклонение с обязательной причиной через промежуточную страницу: причина
    одна на выбранные товары, уходит продавцу. Тот же сервис moderation.py."""
    if 'apply' in request.POST:
        reason = (request.POST.get('reason') or '').strip()
        if not reason:
            modeladmin.message_user(request, 'Укажите причину отклонения', messages.ERROR)
        else:
            reason = reason[:REJECTION_REASON_MAX]
            done = 0
            for product in queryset:
                try:
                    reject_product(product, reason, request.user)
                    done += 1
                except ModerationError:
                    continue
            modeladmin.message_user(request, f'Отклонено: {done}', messages.SUCCESS)
            return None
    return render(request, 'admin/products/reject_reason.html', {
        'products': queryset,
        'reason_max': REJECTION_REASON_MAX,
        'action': 'reject_moderation',
    })


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'seller', 'category', 'price', 'stock', 'status']
    list_filter = ['status', 'category']
    search_fields = ['name', 'description']
    # Аудит модерации (Ф17) виден, но не правится руками - переход только сервисом.
    readonly_fields = ['rejection_reason', 'moderated_at', 'moderated_by']
    inlines = [ProductImageInline]
    actions = [approve_moderation, reject_moderation]


# Q&A в админке (Ф6). is_hidden виден в списке - фоллбэк-модерация Ф18.
@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ['id', 'product', 'user', 'is_hidden', 'created_at']
    list_filter = ['is_hidden']
    search_fields = ['text']
    readonly_fields = ['hidden_at', 'hidden_by']


@admin.register(Answer)
class AnswerAdmin(admin.ModelAdmin):
    list_display = ['id', 'question', 'user', 'helpful_count', 'is_hidden', 'created_at']
    list_filter = ['is_hidden']
    search_fields = ['text']
    readonly_fields = ['hidden_at', 'hidden_by']


# Жалобы и отзывы в админке (Ф18, узел 3.8) - фоллбэк-модерация до фронт-страницы
# очереди (тот же приём, что в Ф6/Ф15). Аудит-поля только для чтения.
@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ['id', 'target_type', 'target_id', 'reason', 'status',
                    'reporter', 'created_at']
    list_filter = ['status', 'target_type', 'reason']
    search_fields = ['comment', 'resolution_note']
    readonly_fields = ['reporter', 'target_type', 'target_id', 'reason', 'comment',
                       'created_at', 'resolved_at', 'resolved_by']


@admin.register(Review)
class ReviewAdmin(admin.ModelAdmin):
    list_display = ['id', 'product', 'user', 'rating', 'is_hidden', 'created_at']
    list_filter = ['is_hidden', 'rating']
    search_fields = ['text']
    readonly_fields = ['hidden_at', 'hidden_by']


# Образы / лукбук (Ф22, узел 1.23). Ввод данных редакцией/брендом - через эту
# админку (план §3): создать образ, привязать вещи инлайном, задать источник и
# is_published. Конструктор образов в кабинете продавца - forward (Ф11/Ф30).
class LookItemInline(admin.TabularInline):
    model = LookItem
    extra = 1
    # raw_id вместо выпадашки на весь каталог товаров (тысячи позиций).
    raw_id_fields = ['product']


@admin.register(Look)
class LookAdmin(admin.ModelAdmin):
    list_display = ['id', 'title', 'source', 'seller', 'is_published', 'created_at']
    list_filter = ['source', 'is_published']
    search_fields = ['title', 'description']
    raw_id_fields = ['seller']
    inlines = [LookItemInline]