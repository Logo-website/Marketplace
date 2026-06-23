"""Сигналы продуктов (P6).

P6a: денормализация рейтинга - при любом изменении отзыва (create/update/delete)
пересчитываем Product.rating и reviews_count из реальных строк Review.
P6b: инвалидация кэша карточки/категорий при изменении данных.
"""
from django.db.models import Avg, Count
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .caching import cache_delete
from .models import (
    Answer, AnswerVote, Category, Look, LookItem, Product, Review, SellerReview,
)
from apps.users.models import User

PRODUCT_CACHE_KEY = 'product_detail:{}'
CATEGORIES_CACHE_KEY = 'categories:root'
BRAND_CACHE_KEY = 'brand:{}'
LOOK_CACHE_KEY = 'look:{}'


def recalc_product_rating(product_id):
    """Пересчитать рейтинг и число отзывов товара из Review и инвалидировать кэш."""
    if not product_id:
        return
    # is_hidden=False (Ф18, §4.3): скрытый модератором отзыв (фейк/накрутка) не
    # влияет на рейтинг и reviews_count. Новый отзыв is_hidden=False - прежнее
    # поведение сохранено; скрытие/возврат триггерят пересчёт через post_save.
    agg = Review.objects.filter(product_id=product_id, is_hidden=False).aggregate(
        avg=Avg('rating'), cnt=Count('id')
    )
    rating = round(agg['avg'], 2) if agg['avg'] is not None else 0
    # update() не вызывает Product.post_save - рекурсии нет.
    Product.objects.filter(id=product_id).update(
        rating=rating, reviews_count=agg['cnt']
    )
    cache_delete(PRODUCT_CACHE_KEY.format(product_id))


@receiver(post_save, sender=Review)
def review_saved(sender, instance, **kwargs):
    recalc_product_rating(instance.product_id)


@receiver(post_delete, sender=Review)
def review_deleted(sender, instance, **kwargs):
    recalc_product_rating(instance.product_id)


@receiver(post_save, sender=Product)
@receiver(post_delete, sender=Product)
def product_changed(sender, instance, **kwargs):
    # Карточка изменилась (создание/правка продавцом/удаление) - сбросить её кэш.
    cache_delete(PRODUCT_CACHE_KEY.format(instance.id))
    # Ф20: число активных товаров в шапке витрины бренда устаревает при
    # add/hide/delete товара - сбрасываем и кэш профиля продавца.
    cache_delete(BRAND_CACHE_KEY.format(instance.seller_id))
    # Ф22 (§5): смена статуса вещи (active<->hidden/moderation) меняет состав и
    # сумму образов с этим товаром - сбрасываем кэш каждого такого образа.
    for look_id in LookItem.objects.filter(
        product_id=instance.id
    ).values_list('look_id', flat=True):
        cache_delete(LOOK_CACHE_KEY.format(look_id))


def recalc_seller_rating(seller_id):
    """Пересчитать рейтинг продавца и число отзывов из SellerReview и сбросить кэш
    витрины (Ф20, зеркало recalc_product_rating P6a). update() не вызывает
    User.post_save - рекурсии нет. Ноль отзывов -> rating=0 («нет оценок»)."""
    if not seller_id:
        return
    agg = SellerReview.objects.filter(seller_id=seller_id).aggregate(
        avg=Avg('rating'), cnt=Count('id')
    )
    rating = round(agg['avg'], 2) if agg['avg'] is not None else 0
    User.objects.filter(id=seller_id).update(
        seller_rating=rating, seller_reviews_count=agg['cnt']
    )
    cache_delete(BRAND_CACHE_KEY.format(seller_id))


@receiver(post_save, sender=SellerReview)
@receiver(post_delete, sender=SellerReview)
def seller_review_changed(sender, instance, **kwargs):
    recalc_seller_rating(instance.seller_id)


@receiver(post_save, sender=Category)
@receiver(post_delete, sender=Category)
def category_changed(sender, **kwargs):
    cache_delete(CATEGORIES_CACHE_KEY)


# Ф22 (§5): правка самого образа или его состава (добавили/убрали вещь, сменили
# порядок/публикацию) инвалидирует кэш карточки образа.
@receiver(post_save, sender=Look)
@receiver(post_delete, sender=Look)
def look_changed(sender, instance, **kwargs):
    cache_delete(LOOK_CACHE_KEY.format(instance.id))


@receiver(post_save, sender=LookItem)
@receiver(post_delete, sender=LookItem)
def look_item_changed(sender, instance, **kwargs):
    cache_delete(LOOK_CACHE_KEY.format(instance.look_id))


def recalc_answer_helpful(answer_id):
    """Пересчитать helpful_count ответа из реальных строк AnswerVote
    (зеркало recalc_product_rating). update() не вызывает Answer.post_save -
    рекурсии нет."""
    if not answer_id:
        return
    cnt = AnswerVote.objects.filter(answer_id=answer_id).count()
    Answer.objects.filter(id=answer_id).update(helpful_count=cnt)


@receiver(post_save, sender=AnswerVote)
@receiver(post_delete, sender=AnswerVote)
def answer_vote_changed(sender, instance, **kwargs):
    recalc_answer_helpful(instance.answer_id)
