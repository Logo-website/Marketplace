from clickhouse_driver import Client
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

client = Client(
    host=settings.CLICKHOUSE_HOST,
    port=settings.CLICKHOUSE_PORT
)


def init_clickhouse():
    client.execute('''
        CREATE TABLE IF NOT EXISTS events (
            event_type String,
            user_id UInt64,
            product_id UInt64,
            order_id UInt64,
            created_at DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY (created_at, event_type)
    ''')


def track_event(event_type, user_id, product_id=0, order_id=0):
    try:
        client.execute(
            'INSERT INTO events (event_type, user_id, product_id, order_id) VALUES',
            [(event_type, user_id, product_id, order_id)]
        )
    except Exception as e:
        logger.error(f'ClickHouse track_event error: {e}')


def get_product_stats(product_id):
    try:
        result = client.execute('''
            SELECT event_type, count() as count
            FROM events
            WHERE product_id = %(product_id)s
            GROUP BY event_type
        ''', {'product_id': product_id})
        return {row[0]: row[1] for row in result}
    except Exception as e:
        logger.error(f'ClickHouse get_product_stats error: {e}')
        return {}


def get_seller_stats(seller_product_ids):
    if not seller_product_ids:
        return []
    try:
        result = client.execute('''
            SELECT product_id, event_type, count() as count
            FROM events
            WHERE product_id IN %(ids)s
            GROUP BY product_id, event_type
            ORDER BY product_id
        ''', {'ids': seller_product_ids})
        return result
    except Exception as e:
        logger.error(f'ClickHouse get_seller_stats error: {e}')
        return []