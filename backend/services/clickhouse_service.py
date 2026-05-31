import logging
logger = logging.getLogger(__name__)

class ClickHouseService:
    @staticmethod
    def log_view(user_id, product_id):
        try:
            from clickhouse import track_event
            track_event('view', user_id, product_id)
        except Exception as e:
            logger.error(f'ClickHouse log_view error: {e}')

    @staticmethod
    def log_purchase(user_id, product_id):
        try:
            from clickhouse import track_event
            track_event('purchase', user_id, product_id)
        except Exception as e:
            logger.error(f'ClickHouse log_purchase error: {e}')