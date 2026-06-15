"""
Единый слой ClickHouse (P5).

- Клиент создаётся лениво (`get_client`), а не на импорте модуля - импорт не падает,
  если ClickHouse недоступен (S9).
- Запись событий идёт асинхронно через Celery-задачу `apps.products.tasks.track_event`
  (S8): HTTP-путь не блокируется недоступным/медленным ClickHouse.
- Аналитические чтения (`get_*_stats`) синхронны - это не горячий путь (дашборд продавца).
"""
import logging
from django.conf import settings

logger = logging.getLogger(__name__)

_client = None


def get_client():
    """Ленивый клиент ClickHouse. Соединение создаётся при первом вызове, не на импорте."""
    global _client
    if _client is None:
        from clickhouse_driver import Client
        _client = Client(
            host=settings.CLICKHOUSE_HOST,
            port=settings.CLICKHOUSE_PORT,
        )
    return _client


def init_events_table():
    """Создаёт таблицу событий, если её нет. Вызывается при старте приложения."""
    get_client().execute('''
        CREATE TABLE IF NOT EXISTS events (
            event_type String,
            user_id UInt64,
            product_id UInt64,
            order_id UInt64,
            created_at DateTime DEFAULT now()
        ) ENGINE = MergeTree()
        ORDER BY (created_at, event_type)
    ''')


def write_event(event_type, user_id, product_id=0, order_id=0):
    """
    Синхронная запись события в ClickHouse.
    Вызывается из Celery-задачи (вне HTTP-пути). Ошибка ClickHouse не валит задачу,
    только пишется в лог.
    """
    try:
        get_client().execute(
            'INSERT INTO events (event_type, user_id, product_id, order_id) VALUES',
            [(event_type, user_id, product_id, order_id)]
        )
    except Exception as e:
        logger.error(f'ClickHouse write_event error: {e}')


def get_copurchase_pairs():
    """
    Матрица ко-покупок (P8): пары товаров, купленных в одном заказе, с частотой.
    Self-join таблицы events по order_id среди purchase-событий.
    Возвращает строки (product_id, recommended_id, freq), отсортированные так,
    что для каждого product_id сначала идут самые частые сопутствующие товары.
    order_id != 0 отсекает старые события до фикса сигнатуры log_purchase (cold start).
    """
    try:
        return get_client().execute('''
            SELECT e1.product_id AS pid, e2.product_id AS rec, count() AS freq
            FROM events e1
            INNER JOIN events e2 ON e1.order_id = e2.order_id
            WHERE e1.event_type = 'purchase'
              AND e2.event_type = 'purchase'
              AND e1.order_id != 0
              AND e1.product_id != e2.product_id
            GROUP BY pid, rec
            ORDER BY pid ASC, freq DESC
        ''')
    except Exception as e:
        logger.error(f'ClickHouse get_copurchase_pairs error: {e}')
        return []


def get_product_stats(product_id):
    try:
        result = get_client().execute('''
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
        result = get_client().execute('''
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


class ClickHouseService:
    """
    Единая точка входа для записи аналитических событий из веб-процесса.
    Не пишет в ClickHouse напрямую - ставит задачу в Celery (S8).
    `.delay()` обёрнут в try/except: недоступный брокер не должен ронять ответ (200).
    """

    @staticmethod
    def log_view(user_id, product_id):
        try:
            from apps.products.tasks import track_event
            track_event.delay('view', user_id, product_id)
        except Exception as e:
            logger.error(f'ClickHouse log_view dispatch error: {e}')

    @staticmethod
    def log_purchase(user_id, product_id, order_id):
        # order_id обязателен (P8): без него нельзя сгруппировать товары одного заказа
        # в пары для матрицы ко-покупок (раньше всегда писался 0).
        try:
            from apps.products.tasks import track_event
            track_event.delay('purchase', user_id, product_id, order_id)
        except Exception as e:
            logger.error(f'ClickHouse log_purchase dispatch error: {e}')
