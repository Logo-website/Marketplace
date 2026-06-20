"""Сигналы продуктов (P6).

P6a: денормализация рейтинга - при любом изменении отзыва (create/update/delete)
пересчитываем Product.rating и reviews_count из реальных строк Review.
P6b: инвалидация кэша карточки/категорий при изменении данных.
"""
from django.db.models import Avg, Count
from django.db.models.signals import post_delete, post_save
from django.dispatch import receiver

from .caching import cache_delete
from .models import Answer, AnswerVote, Category, Product, Review

PRODUCT_CACHE_KEY = 'product_detail:{}'
CATEGORIES_CACHE_KEY = 'categories:root'


def recalc_product_rating(product_id):
    """Пересчитать рейтинг и число отзывов товара из Review и инвалидировать кэш."""
    if not product_id:
        return
    agg = Review.objects.filter(product_id=product_id).aggregate(
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


@receiver(post_save, sender=Category)
@receiver(post_delete, sender=Category)
def category_changed(sender, **kwargs):
    cache_delete(CATEGORIES_CACHE_KEY)


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
