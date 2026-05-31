import logging
logger = logging.getLogger(__name__)

class ElasticsearchService:
    @staticmethod
    def search(query, **filters):
        try:
            from apps.products.search import search_products
            return search_products(query, **filters)
        except Exception as e:
            logger.error(f'ES search error: {e}')
            return []

    @staticmethod
    def index(product):
        try:
            from apps.products.search import index_product
            index_product(product)
        except Exception as e:
            logger.error(f'ES index error: {e}')