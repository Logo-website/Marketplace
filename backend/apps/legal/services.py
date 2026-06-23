import hashlib

from .models import Receipt


def _digits(seed, length):
    """Детерминированная цифровая строка нужной длины из seed (sha256).
    Реквизиты стабильны для одного заказа и не выдаются за настоящие (эмуляция)."""
    h = hashlib.sha256(seed.encode()).hexdigest()
    # hex -> int -> строка цифр; берём первые length символов, дополняем нулями.
    num = str(int(h, 16))
    return (num * length)[:length] if len(num) < length else num[:length]


def generate_receipt(order):
    """Чек 54-ФЗ для заказа - ЭМУЛЯЦИЯ (Ф26, §4.5).

    Идемпотентно (get_or_create по OneToOne order): повторный вызов на ретрае/гонке
    не создаёт второй чек - полагаемся на unique-ограничение БД. Реквизиты
    детерминированы из id заказа: один заказ - один стабильный набор ФН/ФД/ФП.
    Никаких внешних вызовов (ОФД/онлайн-касса) - только локальная генерация.

    Возвращает (receipt, created).
    """
    return Receipt.objects.get_or_create(
        order=order,
        defaults={
            'fn_number': _digits(f'fn-{order.id}', 16),
            'fd_number': _digits(f'fd-{order.id}', 10),
            'fiscal_sign': _digits(f'fp-{order.id}', 10),
            'total': order.total_price,
            'is_emulated': True,
        },
    )
