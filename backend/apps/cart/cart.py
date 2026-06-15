import json
from django.conf import settings

CART_TTL = 60 * 60 * 24 * 7  # 7 дней

_redis = None


def get_redis():
    """Ленивый клиент redis. Соединение создаётся при первом вызове, не на импорте (S9)."""
    global _redis
    if _redis is None:
        import redis
        _redis = redis.from_url(settings.REDIS_URL)
    return _redis


def get_cart(user_id):
    data = get_redis().get(f'cart:{user_id}')
    if data:
        return json.loads(data)
    return {}


def save_cart(user_id, cart):
    get_redis().setex(f'cart:{user_id}', CART_TTL, json.dumps(cart))


def add_to_cart(user_id, product_id, quantity=1):
    cart = get_cart(user_id)
    product_id = str(product_id)
    if product_id in cart:
        cart[product_id] += quantity
    else:
        cart[product_id] = quantity
    save_cart(user_id, cart)
    return cart


def remove_from_cart(user_id, product_id):
    cart = get_cart(user_id)
    product_id = str(product_id)
    if product_id in cart:
        del cart[product_id]
    save_cart(user_id, cart)
    return cart


def clear_cart(user_id):
    get_redis().delete(f'cart:{user_id}')