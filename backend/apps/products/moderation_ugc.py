"""Сервис модерации UGC и обработки жалоб (Ф18, узел 3.8).

Единый источник побочных эффектов скрытия/возврата контента и обработки жалоб
(по образцу moderation.py Ф17): и REST-вьюхи, и фоллбэк-админка зовут этот сервис,
а не дублируют логику и не правят поля «руками».

Ключевые эффекты:
- Скрытие отзыва идёт через .save(update_fields=...), чтобы отработал post_save
  -> recalc_product_rating (signals.py), который исключает is_hidden=True из
  рейтинга/reviews_count и сбрасывает кэш карточки (§4.3). Поэтому НЕ .update().
- Снятие активного товара по жалобе (active -> hidden) - собственное действие Ф18
  (hide_active_product): reject Ф17 неприменим, он только из статуса moderation
  (§3). Товар ещё в moderation - делегируем Ф17.reject.
"""
from django.utils import timezone

from .moderation import ModerationError, reject as reject_product
from .search import delete_product

# Лимит причины скрытия/заметки решения (план §4.1): поле TextField безлимитно.
HIDDEN_REASON_MAX = 2000


def _safe_es(fn, *args):
    """ES best-effort: недоступность ES не валит переход (как в moderation.py Ф17)."""
    try:
        fn(*args)
    except Exception:
        pass


def hide_ugc(obj, by, reason=''):
    """Мягко скрыть UGC-сущность (Review/Question/Answer). Идемпотентно: уже
    скрытое не пересохраняем - нет дубля пересчёта рейтинга/сигнала (§6).
    update_fields включает is_hidden -> у Review триггерит recalc рейтинга."""
    if obj.is_hidden:
        return obj
    obj.is_hidden = True
    obj.hidden_at = timezone.now()
    obj.hidden_reason = (reason or '')[:HIDDEN_REASON_MAX]
    obj.hidden_by = by
    obj.save(update_fields=['is_hidden', 'hidden_at', 'hidden_reason', 'hidden_by'])
    return obj


def unhide_ugc(obj, by):
    """Вернуть скрытую сущность. Идемпотентно: не скрытое - no-op (§6).
    by принимается для единообразия сигнатуры; снятие чистит аудит скрытия."""
    if not obj.is_hidden:
        return obj
    obj.is_hidden = False
    obj.hidden_at = None
    obj.hidden_reason = ''
    obj.hidden_by = None
    obj.save(update_fields=['is_hidden', 'hidden_at', 'hidden_reason', 'hidden_by'])
    return obj


def hide_active_product(product, by, reason=''):
    """Снять активный товар по жалобе: active -> hidden + de-index ES + аудит.
    Кэш карточки сбрасывает сигнал product_changed на .save() (signals.py).
    Только из active: для moderation вызывать Ф17.reject (см. resolve_report)."""
    product.status = 'hidden'
    product.moderated_at = timezone.now()
    product.moderated_by = by
    product.save(update_fields=['status', 'moderated_at', 'moderated_by', 'updated_at'])
    _safe_es(delete_product, product.id)
    return product


# Резолв цели жалобы по типу: модель для действия «скрыть». seller обрабатывается
# отдельно (блокировка - Ф19), product - тоже (зависит от статуса).
_UGC_MODELS = None


def _ugc_models():
    global _UGC_MODELS
    if _UGC_MODELS is None:
        from .models import Answer, Question, Review
        _UGC_MODELS = {'review': Review, 'question': Question, 'answer': Answer}
    return _UGC_MODELS


def _act_on_target(report, by, note):
    """Действие над целью при resolve. Цель могла «протухнуть» (удалена) -
    тихо пропускаем, жалоба всё равно закроется (§6)."""
    t, tid = report.target_type, report.target_id

    if t in _ugc_models():
        obj = _ugc_models()[t].objects.filter(id=tid).first()
        if obj:
            hide_ugc(obj, by, note)
        return

    if t == 'product':
        from .models import Product
        obj = Product.objects.filter(id=tid).first()
        if not obj:
            return
        if obj.status == 'active':
            hide_active_product(obj, by, note)
        elif obj.status == 'moderation':
            # Товар ещё на intake-модерации - это Ф17.reject (§3). Причина
            # обязательна в reject; пустую заметку заменяем дефолтом.
            reject_product(obj, note or 'Снят по жалобе', by)
        # hidden/rejected/draft - уже вне витрины, действий не требуется.
        return

    # seller: блокировка продавца - Ф19. В Ф18 жалобу только фиксируем заметкой.


def resolve_report(report, by, note=''):
    """Решить жалобу с действием над целью (скрыть UGC / снять товар). Жалоба
    должна быть open - повторная/конкурентная обработка -> ModerationError (409),
    без двойного действия над целью (§6, идемпотентность)."""
    if report.status != 'open':
        raise ModerationError('Жалоба уже обработана')
    _act_on_target(report, by, note)
    report.status = 'resolved'
    report.resolved_at = timezone.now()
    report.resolved_by = by
    report.resolution_note = (note or '')[:HIDDEN_REASON_MAX]
    report.save(update_fields=['status', 'resolved_at', 'resolved_by',
                               'resolution_note'])
    return report


def dismiss_report(report, by, note=''):
    """Отклонить жалобу (нарушения нет): цель не трогаем. Идемпотентность - как
    в resolve_report (только из open)."""
    if report.status != 'open':
        raise ModerationError('Жалоба уже обработана')
    report.status = 'dismissed'
    report.resolved_at = timezone.now()
    report.resolved_by = by
    report.resolution_note = (note or '')[:HIDDEN_REASON_MAX]
    report.save(update_fields=['status', 'resolved_at', 'resolved_by',
                               'resolution_note'])
    return report
