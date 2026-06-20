from django.contrib import admin
from .models import Answer, Category, Product, ProductImage, Question


class ProductImageInline(admin.TabularInline):
    model = ProductImage
    extra = 1


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'parent']
    prepopulated_fields = {'slug': ('name',)}


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'seller', 'category', 'price', 'stock', 'status']
    list_filter = ['status', 'category']
    search_fields = ['name', 'description']
    inlines = [ProductImageInline]


# Модерация Q&A до полноценной Ф18 - через стандартную админку.
@admin.register(Question)
class QuestionAdmin(admin.ModelAdmin):
    list_display = ['id', 'product', 'user', 'created_at']
    search_fields = ['text']


@admin.register(Answer)
class AnswerAdmin(admin.ModelAdmin):
    list_display = ['id', 'question', 'user', 'helpful_count', 'created_at']
    search_fields = ['text']