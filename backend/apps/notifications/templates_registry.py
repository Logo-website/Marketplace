"""Реестр шаблонов уведомлений по типу события (узел 1.17, §4.2 плана).

Одна точка рендера title/body/link/email из event_type. Принципы:
- on-site title/body хранятся как ПЛЕЙН-ТЕКСТ; фронт (React) экранирует при выводе.
- e-mail-HTML собирается здесь, и КАЖДАЯ подстановка экранируется (`escape`) - UGC
  (текст рассылки/ответа) в письме не исполняется (XSS, §8).
- неизвестный event_type не роняет notify(): отдаём нейтральный дефолт + warning,
  категория маркетинговая (e-mail по умолчанию не уходит - не спамим на баге).
- секреты (токены/коды/пароли) через реестр не проходят - OTP идёт своим путём.
"""
import logging
from django.utils.html import escape

from .models import Notification

logger = logging.getLogger(__name__)

# Человекочитаемые статусы заказа - совпадают с valid_transitions в orders/views.py
# (реальные статусы кода, а не формулировки карты).
_STATUS_LABELS = {
    'created': 'оформлен',
    'paid': 'оплачен',
    'processing': 'в обработке',
    'shipped': 'отправлен',
    'delivered': 'доставлен',
    'cancelled': 'отменён',
}

ORDERS_LINK = '/profile?tab=orders'
RETURNS_LINK = '/profile?tab=returns'

# Человекочитаемые статусы возврата (Ф23) - совпадают с ReturnRequest.STATUS_CHOICES.
# Уведомляем покупателя только о решениях продавца/админа, не о собственном споре.
_RETURN_LABELS = {
    'approved': 'одобрен',
    'rejected': 'отклонён',
    'received': 'товар получен продавцом',
    'refunded': 'деньги возвращены',
}


class NotificationContent:
    """Готовый к доставке контент уведомления (результат рендера)."""

    def __init__(self, *, category, title, body, link, email_subject, email_html):
        self.category = category
        self.title = title
        self.body = body
        self.link = link
        self.email_subject = email_subject
        self.email_html = email_html


def _email_html(heading, *paragraphs):
    """Единый HTML-каркас письма. Заголовок и абзацы ЭКРАНИРУЮТСЯ (UGC-safe)."""
    body = ''.join(
        f'<p style="color:#333;">{escape(p)}</p>' for p in paragraphs if p
    )
    return (
        '<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">'
        f'<h2 style="color:#111;">{escape(heading)}</h2>'
        f'{body}'
        '<hr style="border:none;border-top:1px solid #eee;margin:20px 0;">'
        '<p style="color:#999;font-size:12px;">Marketplace - ваш любимый магазин одежды</p>'
        '</div>'
    )


def _render_order(event_type, ctx):
    status = event_type.split('.', 1)[1]
    label = _STATUS_LABELS.get(status, status)
    order_id = ctx.get('order_id', '')
    total = ctx.get('total')
    if status == 'created':
        title = f'Заказ #{order_id} оформлен'
        body = (
            f'Ваш заказ на сумму {total} ₽ успешно оформлен.'
            if total is not None else 'Ваш заказ успешно оформлен.'
        )
    else:
        title = f'Заказ #{order_id}: {label}'
        body = f'Статус вашего заказа #{order_id} изменён на «{label}».'
    return NotificationContent(
        category=Notification.CATEGORY_ORDER,
        title=title,
        body=body,
        link=ORDERS_LINK,
        email_subject=title + ' - Marketplace',
        email_html=_email_html(title, body),
    )


def _render_return(event_type, ctx):
    # Статус возврата (Ф23). Транзакционное: покупатель обязан узнать решение по
    # заявке, e-mail уходит всегда. Текст без UGC - подставляются только id (числа).
    status = event_type.split('.', 1)[1]
    label = _RETURN_LABELS.get(status, status)
    order_id = ctx.get('order_id', '')
    title = f'Возврат по заказу #{order_id}: {label}'
    body = f'Статус вашей заявки на возврат изменён на «{label}».'
    return NotificationContent(
        category=Notification.CATEGORY_ORDER,
        title=title,
        body=body,
        link=RETURNS_LINK,
        email_subject=title + ' - Marketplace',
        email_html=_email_html(title, body),
    )


def _render_broadcast(event_type, ctx):
    # Маркетинговая рассылка (3.10): заголовок/текст - вход админки (UGC-подобный),
    # экранируется в письме; на фронте выводится как текст.
    title = (ctx.get('title') or 'Новое уведомление')[:200]
    body = ctx.get('body') or ''
    link = ctx.get('link') or ''
    return NotificationContent(
        category=Notification.CATEGORY_MARKETING,
        title=title,
        body=body,
        link=link,
        email_subject=title + ' - Marketplace',
        email_html=_email_html(title, body),
    )


# Forward-события (продюсеры в Ф6/Ф15/Ф20/Ф27 и серверная подписка ещё не в коде).
# Реестр готов, чтобы их фазы только позвали notify() - сами события тут НЕ эмитятся.
_FORWARD = {
    # ответ на вопрос/отзыв -> Ф6/Ф15 (транзакционное: ответ на твой контент)
    'review.answered': Notification.CATEGORY_ORDER,
    'question.answered': Notification.CATEGORY_ORDER,
    # снижение цены / поступление -> серверная подписка Ф10/Ф20 (opt-in)
    'price.drop': Notification.CATEGORY_PRICE,
    'restock': Notification.CATEGORY_PRICE,
    # новинки/акции бренда -> Ф20 (маркетинг)
    'brand.new_product': Notification.CATEGORY_MARKETING,
}


def _render_forward(event_type, ctx):
    category = _FORWARD[event_type]
    title = (ctx.get('title') or 'Новое уведомление')[:200]
    body = ctx.get('body') or ''
    link = ctx.get('link') or ''
    return NotificationContent(
        category=category, title=title, body=body, link=link,
        email_subject=title + ' - Marketplace', email_html=_email_html(title, body),
    )


def _render_default(event_type, ctx):
    # Опечатка ключа / забытый статус: не падаем, отдаём нейтральный дефолт без e-mail
    # (категория marketing -> по умолчанию opt-in выключен), пишем warning.
    logger.warning(f'notification: нет шаблона для event_type={event_type!r}, дефолт')
    return NotificationContent(
        category=Notification.CATEGORY_MARKETING,
        title='Новое уведомление',
        body=ctx.get('body') or '',
        link=ctx.get('link') or '',
        email_subject='Новое уведомление - Marketplace',
        email_html=_email_html('Новое уведомление', ctx.get('body') or ''),
    )


def render(event_type, ctx):
    """event_type + контекст -> NotificationContent. Никогда не бросает."""
    ctx = ctx or {}
    if event_type.startswith('order.'):
        return _render_order(event_type, ctx)
    if event_type.startswith('return.'):
        return _render_return(event_type, ctx)
    if event_type == 'broadcast':
        return _render_broadcast(event_type, ctx)
    if event_type in _FORWARD:
        return _render_forward(event_type, ctx)
    return _render_default(event_type, ctx)
