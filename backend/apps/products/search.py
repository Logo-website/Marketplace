from django.conf import settings
import logging

logger = logging.getLogger(__name__)

INDEX_NAME = 'products'

DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100
AUTOCOMPLETE_SIZE = 6
MAX_QUERY_LEN = 200  # защита от чрезмерно длинного ввода

# Ценовые корзины для фасетов (RUB). Замыкающая корзина - без верхней границы.
PRICE_RANGES = [
    {'key': '0-1000', 'to': 1000},
    {'key': '1000-3000', 'from': 1000, 'to': 3000},
    {'key': '3000-10000', 'from': 3000, 'to': 10000},
    {'key': '10000+', 'from': 10000},
]

_es = None


def get_es():
    """Ленивый клиент Elasticsearch. Соединение создаётся при первом вызове, не на импорте (S9)."""
    global _es
    if _es is None:
        from elasticsearch import Elasticsearch
        _es = Elasticsearch(settings.ELASTICSEARCH_URL)
    return _es


def create_index():
    es = get_es()
    if not es.indices.exists(index=INDEX_NAME):
        es.indices.create(index=INDEX_NAME, body={
            'mappings': {
                'properties': {
                    'name': {'type': 'text', 'analyzer': 'russian'},
                    'description': {'type': 'text', 'analyzer': 'russian'},
                    'price': {'type': 'float'},
                    'category': {'type': 'keyword'},
                    # category_id - чтобы фильтр поиска совпадал с каталогом (фильтр по id, не по имени).
                    'category_id': {'type': 'keyword'},
                    'status': {'type': 'keyword'},
                }
            }
        })


def index_product(product):
    get_es().index(index=INDEX_NAME, id=product.id, body={
        'name': product.name,
        'description': product.description,
        'price': float(product.price),
        'category': product.category.name if product.category else '',
        'category_id': str(product.category_id) if product.category_id else '',
        'status': product.status,
    })


def delete_product(product_id):
    get_es().delete(index=INDEX_NAME, id=product_id, ignore=[404])


def _category_filter(category_id):
    if not category_id:
        return None
    return {'term': {'category_id': str(category_id)}}


def _price_filter(min_price, max_price):
    rng = {}
    if min_price is not None:
        rng['gte'] = min_price
    if max_price is not None:
        rng['lte'] = max_price
    if not rng:
        return None
    return {'range': {'price': rng}}


def _price_range_aggs():
    ranges = []
    for r in PRICE_RANGES:
        spec = {'key': r['key']}
        if 'from' in r:
            spec['from'] = r['from']
        if 'to' in r:
            spec['to'] = r['to']
        ranges.append(spec)
    return {'field': 'price', 'ranges': ranges}


def _empty_result():
    return {'ids': [], 'total': 0, 'facets': {'categories': [], 'price_ranges': []}}


def search_products(query, min_price=None, max_price=None, category=None,
                    page=1, page_size=DEFAULT_PAGE_SIZE):
    """Поиск с фасетами и пагинацией.

    Фасеты считаются по схеме post_filter + per-facet filtered aggs: каждый
    фасет агрегируется без своего собственного фильтра (категория - без фильтра
    категории, цена - без фильтра цены), но с учётом остальных активных фильтров.
    Так пользователь видит корректные счётчики и может переключаться между
    значениями уже выбранного фасета.

    При недоступности ES возвращает пустой безопасный результат (graceful, не 500).
    """
    query = (query or '').strip()[:MAX_QUERY_LEN]
    if not query:
        return _empty_result()

    page = max(1, _to_int(page, 1))
    page_size = min(max(1, _to_int(page_size, DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE)
    from_ = (page - 1) * page_size

    should = [
        {'multi_match': {'query': query, 'fields': ['name^3', 'description'], 'fuzziness': 'AUTO'}},
        {'prefix': {'name': {'value': query.lower(), 'boost': 2}}},
        {'match_phrase_prefix': {'name': {'query': query, 'boost': 3}}},
    ]

    cat_f = _category_filter(category)
    price_f = _price_filter(min_price, max_price)
    post_filters = [f for f in (cat_f, price_f) if f]

    body = {
        'query': {
            'bool': {
                'should': should,
                # status - всегда-он фильтр запроса (применяется и к hits, и к фасетам).
                'filter': [{'term': {'status': 'active'}}],
                'minimum_should_match': 1,
            }
        },
        'from': from_,
        'size': page_size,
        'track_total_hits': True,
        'aggs': {
            # Счётчики категорий - без фильтра категории, но с учётом фильтра цены.
            'categories': {
                'filter': {'bool': {'filter': [f for f in (price_f,) if f]}},
                'aggs': {'by_cat': {'terms': {'field': 'category_id', 'size': 50}}},
            },
            # Счётчики ценовых корзин - без фильтра цены, но с учётом фильтра категории.
            'price_ranges': {
                'filter': {'bool': {'filter': [f for f in (cat_f,) if f]}},
                'aggs': {'by_range': {'range': _price_range_aggs()}},
            },
        },
    }
    if post_filters:
        body['post_filter'] = {'bool': {'filter': post_filters}}

    try:
        result = get_es().search(index=INDEX_NAME, body=body)
    except Exception as e:
        logger.error(f'ES search error: {e}')
        return _empty_result()

    hits = result.get('hits', {})
    ids = [int(hit['_id']) for hit in hits.get('hits', [])]
    total = hits.get('total', 0)
    if isinstance(total, dict):
        total = total.get('value', 0)

    aggs = result.get('aggregations', {})
    cat_buckets = aggs.get('categories', {}).get('by_cat', {}).get('buckets', [])
    price_buckets = aggs.get('price_ranges', {}).get('by_range', {}).get('buckets', [])

    return {
        'ids': ids,
        'total': total,
        'facets': {
            'categories': [
                {'id': int(b['key']), 'count': b['doc_count']}
                for b in cat_buckets if b.get('key')
            ],
            'price_ranges': [
                {'key': b.get('key'), 'from': b.get('from'), 'to': b.get('to'), 'count': b['doc_count']}
                for b in price_buckets
            ],
        },
    }


def autocomplete(query, size=AUTOCOMPLETE_SIZE):
    """Лёгкие подсказки по name через match_phrase_prefix.

    Без фасетов и без полной выдачи: возвращает только id найденных активных
    товаров (обогащение минимальными полями - на стороне view). Запрос легче
    основного поиска (один match_phrase_prefix вместо multi_match+fuzzy+prefix).
    Graceful: при недоступности ES - пустой список.
    """
    query = (query or '').strip()[:MAX_QUERY_LEN]
    if not query:
        return []
    body = {
        'query': {
            'bool': {
                'must': [{'match_phrase_prefix': {'name': {'query': query}}}],
                'filter': [{'term': {'status': 'active'}}],
            }
        },
        '_source': False,
        'size': size,
    }
    try:
        result = get_es().search(index=INDEX_NAME, body=body)
    except Exception as e:
        logger.error(f'ES autocomplete error: {e}')
        return []
    return [int(hit['_id']) for hit in result.get('hits', {}).get('hits', [])]


def _to_int(value, default):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
