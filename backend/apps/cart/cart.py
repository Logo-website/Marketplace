import json
from django.conf import settings

CART_TTL = 60 * 60 * 24 * 7  # 7 дней

# Сепаратор сегментов составного ключа позиции. '|' не встречается в размерах
# (M/42/L) и названиях цветов, поэтому ключ парсится однозначно.
KEY_SEP = '|'

_redis = None


def get_redis():
    """Ленивый клиент redis. Соединение создаётся при первом вызове, не на импорте (S9)."""
    global _redis
    if _redis is None:
        import redis
        _redis = redis.from_url(settings.REDIS_URL)
    return _redis


def cart_key(product_id, size='', color=''):
    """Составной ключ позиции корзины: ``product_id|size|color``.

    Один товар в двух размерах = две позиции. Товар без вариантов -> пустые
    сегменты (одна строка на товар), без мусора вида ``5|||``. Ключевая
    абстракция Ф8: весь код (set количества, выбор, оформление) работает против
    helper-а, чтобы переход на варианты не ломал ядро.
    """
    return f'{int(product_id)}{KEY_SEP}{size or ""}{KEY_SEP}{color or ""}'


def parse_cart_key(key):
    """Разбирает ключ корзины в ``(product_id, size, color)``.

    Обратная совместимость: старый ключ без сепаратора (только ``product_id`` из
    корзин до Ф8) парсится как product_id с пустым вариантом - корзины в Redis
    прежнего формата не падают (TTL 7 дней, формат самозаживает). Нечисловой
    префикс -> ValueError, ловится вызывающим.
    """
    parts = str(key).split(KEY_SEP)
    product_id = int(parts[0])
    size = parts[1] if len(parts) > 1 else ''
    color = parts[2] if len(parts) > 2 else ''
    return product_id, size, color


def get_cart(user_id):
    data = get_redis().get(f'cart:{user_id}')
    if data:
        return json.loads(data)
    return {}


def save_cart(user_id, cart):
    get_redis().setex(f'cart:{user_id}', CART_TTL, json.dumps(cart))


def add_to_cart(user_id, key, quantity=1):
    """Суммирует количество для позиции (ключ из cart_key)."""
    cart = get_cart(user_id)
    cart[key] = cart.get(key, 0) + quantity
    save_cart(user_id, cart)
    return cart


def try_add(user_id, product_id, quantity=1, size='', color=''):
    """Единая точка добавления в корзину с валидацией (Ф8 + батч-образ Ф22).

    Проверяет «товар active» и «текущее в корзине + qty <= остаток», затем
    добавляет. Возвращает dict {ok, reason, stock}, где reason in
    (None | 'not_found' | 'out_of_stock'), stock - остаток для сообщения
    («Доступно: N»). Вынесено сюда, чтобы одиночное добавление (CartView.post) и
    батч «весь образ в корзину» (LookAddToCartView) не дублировали логику и не
    расходились по правилам остатка (план §4.4). Каждый вызов читает/пишет корзину
    сам - в батче последовательные вызовы корректно накапливают «текущее в корзине».
    """
    from apps.products.models import Product
    try:
        product = Product.objects.get(id=product_id, status='active')
    except Product.DoesNotExist:
        return {'ok': False, 'reason': 'not_found', 'stock': None}
    key = cart_key(product_id, size, color)
    cart = get_cart(user_id)
    if cart.get(key, 0) + quantity > product.stock:
        return {'ok': False, 'reason': 'out_of_stock', 'stock': product.stock}
    add_to_cart(user_id, key, quantity)
    return {'ok': True, 'reason': None, 'stock': product.stock}


def set_cart_quantity(user_id, key, quantity):
    """Устанавливает точное количество позиции (для кнопок +/-, не delete+post)."""
    cart = get_cart(user_id)
    cart[key] = quantity
    save_cart(user_id, cart)
    return cart


def remove_from_cart(user_id, key):
    cart = get_cart(user_id)
    cart.pop(key, None)
    save_cart(user_id, cart)
    return cart


def remove_keys(user_id, keys):
    """Удаляет конкретные позиции (после частичного оформления - чистим только
    оформленное, не всю корзину)."""
    cart = get_cart(user_id)
    changed = False
    for k in keys:
        if k in cart:
            del cart[k]
            changed = True
    if changed:
        save_cart(user_id, cart)
    return cart


def clear_cart(user_id):
    get_redis().delete(f'cart:{user_id}')
