import logging
logger = logging.getLogger(__name__)

class CartService:
    @staticmethod
    def get(user_id):
        try:
            from apps.cart.cart import get_cart
            return get_cart(user_id)
        except Exception as e:
            logger.error(f'Cart get error: {e}')
            return {}

    @staticmethod
    def add(user_id, product_id, quantity=1):
        try:
            from apps.cart.cart import add_to_cart
            return add_to_cart(user_id, product_id, quantity)
        except Exception as e:
            logger.error(f'Cart add error: {e}')

    @staticmethod
    def remove(user_id, product_id):
        try:
            from apps.cart.cart import remove_from_cart
            return remove_from_cart(user_id, product_id)
        except Exception as e:
            logger.error(f'Cart remove error: {e}')

    @staticmethod
    def clear(user_id):
        try:
            from apps.cart.cart import clear_cart
            return clear_cart(user_id)
        except Exception as e:
            logger.error(f'Cart clear error: {e}')