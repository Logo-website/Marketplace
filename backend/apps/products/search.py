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
                    # Ф3: те же фильтры/сортировка, что в каталоге (Ф2). Рейтинг -
                    # из колонки Product.rating (не из attributes.rating!), чтобы
                    # фасеты поиска и каталога не разошлись (план Ф3, решение 1).
                    'brand': {'type': 'keyword'},
                    'rating': {'type': 'float'},
                    'in_stock': {'type': 'boolean'},
                    'created_at': {'type': 'date'},
                }
            }
        })


def index_product(product):
    # brand - из attributes (как фасет каталога Ф2); пустой не индексируем,
    # чтобы не плодить мёртвую корзину «без бренда» (паритет с CatalogFacetsView).
    brand = (product.attributes or {}).get('brand') or None
    get_es().index(index=INDEX_NAME, id=product.id, body={
        'name': product.name,
        'description': product.description,
        'price': float(product.price),
        'category': product.category.name if product.category else '',
        'category_id': str(product.category_id) if product.category_id else '',
        'status': product.status,
        'brand': brand,
        # Рейтинг - из колонки Product.rating, той же, по которой фильтрует каталог.
        'rating': float(product.rating or 0),
        'in_stock': product.stock > 0,
        'created_at': product.created_at.isoformat() if product.created_at else None,
    })


def delete_product(product_id):
    get_es().delete(index=INDEX_NAME, id=product_id, ignore=[404])


RATING_THRESHOLDS = [4, 3, 2, 1]  # фасет «от N★», как в каталоге Ф2
BRAND_FACET_SIZE = 30             # топ-N брендов (высокая кардинальность)

# Сортировки поиска. relevance/popular -> порядок _score (sort-клауза не ставится);
# остальные - ES sort по полям, попавшим в индекс решением 1. popular - безопасный
# алиас релевантности для поиска (каталожный «популярное» здесь = «по релевантности»).
SORT_CLAUSES = {
    'price_asc': [{'price': 'asc'}],
    'price_desc': [{'price': 'desc'}],
    'rating': [{'rating': 'desc'}],
    'new': [{'created_at': 'desc'}],
}


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


def _brand_filter(brands):
    if not brands:
        return None
    return {'terms': {'brand': list(brands)}}


def _rating_filter(min_rating):
    if min_rating is None:
        return None
    return {'range': {'rating': {'gte': min_rating}}}


def _in_stock_filter(in_stock):
    if not in_stock:
        return None
    return {'term': {'in_stock': True}}


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


def _facet_filter(active, own):
    """Обёртка-фильтр для агрегата одного фасета: все активные фильтры, КРОМЕ
    собственного фильтра этого фасета (per-facet filtered aggregation). Так
    счётчики корректны под уже выбранными значениями, а мульти-выбор работает.
    Совпадает со схемой каталога (_apply_catalog_filters с exclude)."""
    return {'bool': {'filter': [f for k, f in active.items() if f and k != own]}}


def _empty_facets():
    return {'categories': [], 'price_ranges': [], 'brands': [],
            'rating_thresholds': [], 'in_stock_count': 0}


def _empty_result():
    return {'ids': [], 'total': 0, 'facets': _empty_facets(),
            'suggestion': None, 'error': False}


def _error_result():
    """ES недоступен: явная ошибка, НЕ «пустой результат» (план Ф3, решение 6).
    View по флагу error отдаёт 503 -> фронт показывает ErrorState, а не лжёт
    «ничего не найдено»."""
    return {'ids': [], 'total': 0, 'facets': _empty_facets(),
            'suggestion': None, 'error': True}


def _extract_suggestion(suggest, query):
    """Собирает «возможно, вы искали» из term-suggester по name. Заменяет
    токены, для которых ES предложил исправление; если итог совпадает с
    запросом или пуст - возвращает None (не водим пользователя по кругу)."""
    entries = (suggest or {}).get('did_you_mean')
    if not entries:
        return None
    tokens, changed = [], False
    for entry in entries:
        options = entry.get('options', [])
        if options:
            tokens.append(options[0]['text'])
            changed = True
        else:
            tokens.append(entry.get('text', ''))
    if not changed:
        return None
    corrected = ' '.join(t for t in tokens if t).strip()
    if not corrected or corrected.lower() == query.lower():
        return None
    return corrected


def search_products(query, min_price=None, max_price=None, category=None,
                    brands=None, min_rating=None, in_stock=False, sort=None,
                    page=1, page_size=DEFAULT_PAGE_SIZE):
    """Поиск с фасетами, фильтрами, сортировкой и пагинацией.

    Фильтрует по тому же набору, что каталог Ф2 (категория/цена/бренд/рейтинг/
    наличие), сохраняя релевантностное ранжирование (_score). Фасеты считаются
    по схеме post_filter + per-facet filtered aggs: каждый фасет агрегируется без
    своего собственного фильтра, но с учётом остальных активных. Так счётчики
    корректны под выбранными значениями и совпадают с каталогом.

    sort: relevance/popular/пусто -> _score; price_asc/price_desc/rating/new ->
    ES sort. Неизвестный sort откатывается к релевантности (без 500).

    При недоступности ES возвращает результат с error=True (не пустой) - чтобы
    view развёл «пусто» и «ошибка» (план Ф3, решение 6).
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

    # Активные фильтры по имени фасета - для post_filter и per-facet исключения.
    active = {
        'category': _category_filter(category),
        'price': _price_filter(min_price, max_price),
        'brand': _brand_filter(brands),
        'rating': _rating_filter(min_rating),
        'in_stock': _in_stock_filter(in_stock),
    }
    post_filters = [f for f in active.values() if f]

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
            'categories': {
                'filter': _facet_filter(active, 'category'),
                'aggs': {'by_cat': {'terms': {'field': 'category_id', 'size': 50}}},
            },
            'price_ranges': {
                'filter': _facet_filter(active, 'price'),
                'aggs': {'by_range': {'range': _price_range_aggs()}},
            },
            'brands': {
                'filter': _facet_filter(active, 'brand'),
                'aggs': {'by_brand': {'terms': {'field': 'brand', 'size': BRAND_FACET_SIZE}}},
            },
            'ratings': {
                'filter': _facet_filter(active, 'rating'),
                'aggs': {'by_threshold': {'filters': {'filters': {
                    str(t): {'range': {'rating': {'gte': t}}} for t in RATING_THRESHOLDS
                }}}},
            },
            'in_stock': {
                'filter': _facet_filter(active, 'in_stock'),
                'aggs': {'available': {'filter': {'term': {'in_stock': True}}}},
            },
        },
        'suggest': {
            'text': query,
            'did_you_mean': {'term': {'field': 'name', 'size': 1}},
        },
    }
    sort_clause = SORT_CLAUSES.get(sort)
    if sort_clause:
        body['sort'] = sort_clause
    if post_filters:
        body['post_filter'] = {'bool': {'filter': post_filters}}

    try:
        result = get_es().search(index=INDEX_NAME, body=body)
    except Exception as e:
        logger.error(f'ES search error: {e}')
        return _error_result()

    hits = result.get('hits', {})
    ids = [int(hit['_id']) for hit in hits.get('hits', [])]
    total = hits.get('total', 0)
    if isinstance(total, dict):
        total = total.get('value', 0)

    aggs = result.get('aggregations', {})
    cat_buckets = aggs.get('categories', {}).get('by_cat', {}).get('buckets', [])
    price_buckets = aggs.get('price_ranges', {}).get('by_range', {}).get('buckets', [])
    brand_buckets = aggs.get('brands', {}).get('by_brand', {}).get('buckets', [])
    rating_buckets = aggs.get('ratings', {}).get('by_threshold', {}).get('buckets', {})
    in_stock_count = aggs.get('in_stock', {}).get('available', {}).get('doc_count', 0)

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
            'brands': [
                {'value': b['key'], 'count': b['doc_count']}
                for b in brand_buckets if b.get('key')
            ],
            # Пороги рейтинга в фиксированном порядке (4,3,2,1), как в каталоге.
            'rating_thresholds': [
                {'value': t, 'count': rating_buckets.get(str(t), {}).get('doc_count', 0)}
                for t in RATING_THRESHOLDS
            ],
            'in_stock_count': in_stock_count,
        },
        'suggestion': _extract_suggestion(result.get('suggest'), query),
        'error': False,
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
