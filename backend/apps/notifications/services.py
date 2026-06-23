"""Центр уведомлений (§4.2): одна безопасная точка notify(user, event, context).

Сохраняет уведомление в ленту (on-site всегда), затем после коммита раскладывает по
каналам согласно настройкам пользователя. Категория решает транзакц./маркетинг:
- order  - транзакционное, e-mail уходит всегда (человек обязан узнать статус заказа);
- price  - opt-in (price_email);
- marketing - opt-in (promos_email), уважает отписку.
Сбой канала не валит вызвавший запрос (тот же принцип, что Kafka/Resend/cache в коде).
"""
import logging

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils.html import escape

from . import channels
from .models import Notification
from .templates_registry import render

logger = logging.getLogger(__name__)

# Отписка по подписанному токену (Django signing на SECRET_KEY): нельзя отписать
# другого или перебрать пользователей по id (§8). TTL ограничивает протухшие ссылки.
UNSUBSCRIBE_SALT = 'notifications.unsubscribe'
UNSUBSCRIBE_MAX_AGE = 60 * 60 * 24 * 30  # 30 дней


def make_unsubscribe_token(user):
    return signing.dumps(user.pk, salt=UNSUBSCRIBE_SALT)


def read_unsubscribe_token(token):
    """user_id из валидного токена. Бросает signing.BadSignature (в т.ч.
    SignatureExpired) на подделанном/чужом/протухшем токене."""
    return signing.loads(token, salt=UNSUBSCRIBE_SALT, max_age=UNSUBSCRIBE_MAX_AGE)


def _with_unsubscribe_footer(email_html, user):
    """Дописывает в маркетинговое письмо one-click ссылку отписки (§4.4)."""
    url = f'{settings.SITE_URL}/api/notifications/unsubscribe/{make_unsubscribe_token(user)}/'
    footer = (
        '<p style="color:#bbb;font-size:11px;margin-top:8px;">'
        f'Не хотите такие письма? <a href="{escape(url)}" style="color:#bbb;">Отписаться</a>.'
        '</p>'
    )
    return email_html + footer

# Категория -> ключ предпочтения e-mail в User.notification_prefs (Ф10).
# None = транзакционное: e-mail уходит всегда, отключить нельзя.
_EMAIL_PREF = {
    Notification.CATEGORY_ORDER: None,
    Notification.CATEGORY_PRICE: 'price_email',
    Notification.CATEGORY_MARKETING: 'promos_email',
}


def _email_allowed(user, category):
    """Транзакционные - всегда. Маркетинг/цена - только при включённом тумблере
    (дефолт OFF: рассылку шлём по согласию, 152-ФЗ)."""
    key = _EMAIL_PREF.get(category)
    if key is None:
        return True
    return bool((user.notification_prefs or {}).get(key, False))


def notify(user, event_type, context=None, *, category=None):
    """Создаёт уведомление в ленте и раскладывает по каналам. Возвращает Notification.

    on-site (лента) создаётся ВСЕГДА - это in-app запись, которую пользователь видит,
    открыв колокольчик. Живой WS-пуш и e-mail диспатчатся через transaction.on_commit
    (commit-safety, S8): если вызов внутри транзакции, побочки стартуют только после
    коммита; вне транзакции on_commit выполняет callback немедленно.
    """
    content = render(event_type, context)
    cat = category or content.category

    notification = Notification.objects.create(
        recipient=user,
        event_type=event_type,
        category=cat,
        title=content.title,
        body=content.body,
        link=content.link,
    )

    def fanout():
        try:
            channels.deliver_onsite_live(notification)
            if _email_allowed(user, cat):
                email_html = content.email_html
                # Маркетинг/цена - даём one-click отписку в футере письма.
                # Транзакционные (заказ) отписки «от всего» не дают (нельзя отписаться
                # от статуса своего заказа).
                if cat != Notification.CATEGORY_ORDER:
                    email_html = _with_unsubscribe_footer(email_html, user)
                channels.send_email(user, content.email_subject, email_html)
            channels.deliver_sms_push_stub(user, notification)
        except Exception as e:
            logger.error(
                f'notify fanout error (user={user.id}, event={event_type}): {e}'
            )

    transaction.on_commit(fanout)
    return notification
