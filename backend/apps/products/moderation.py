"""Сервис модерации товаров (Ф17, узел 3.2).

Единый переход moderation -> active|rejected с побочными эффектами (ES + кэш).
Один источник правды для REST-вьюх и admin-actions Django (DRY): и там, и там
вызывается этот сервис, а не дублируется логика и не правится статус «руками».

Побочные эффекты:
- Кэш карточки product_detail:{id} чистит сигнал product_changed на .save()
  (signals.py) - поэтому переход идёт через .save(update_fields=...), а не
  .update() (тот обходит сигнал и оставил бы устаревший кэш).
- ES зовём явно (сигнала на ES нет). Best-effort: падение ES НЕ валит переход -
  товар становится active в БД (виден в каталоге), поиск догонится reindex.
"""
import logging

from django.utils import timezone

from .search import index_product, delete_product

logger = logging.getLogger(__name__)


class ModerationError(Exception):
    """Переход невозможен: товар уже не на модерации (гонка/повторное действие)."""


def _safe_es(fn, *args):
    """ES-синхронизация best-effort: недоступность ES не валит переход (§6)."""
    try:
        fn(*args)
    except Exception as e:
        logger.warning(f'ES sync skipped in moderation: {e}')


def approve(product, moderator):
    """moderation -> active. Чистит причину, пишет аудит, индексирует в ES.

    Валидирует актуальный статус: повторное/конкурентное одобрение уже
    промодерированного товара -> ModerationError (без двойного побочного эффекта).
    """
    if product.status != 'moderation':
        raise ModerationError('Товар уже промодерирован')
    product.status = 'active'
    product.rejection_reason = ''
    product.moderated_at = timezone.now()
    product.moderated_by = moderator
    product.save(update_fields=['status', 'rejection_reason',
                                'moderated_at', 'moderated_by', 'updated_at'])
    _safe_es(index_product, product)
    return product


def reject(product, reason, moderator):
    """moderation -> rejected с причиной. Убирает из ES (отклонённый не ищется).

    reason уже провалидирован (непустой, лимит длины) в RejectionSerializer.
    """
    if product.status != 'moderation':
        raise ModerationError('Товар уже промодерирован')
    product.status = 'rejected'
    product.rejection_reason = reason
    product.moderated_at = timezone.now()
    product.moderated_by = moderator
    product.save(update_fields=['status', 'rejection_reason',
                                'moderated_at', 'moderated_by', 'updated_at'])
    _safe_es(delete_product, product.id)
    return product
