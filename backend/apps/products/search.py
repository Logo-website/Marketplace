from elasticsearch import Elasticsearch
from django.conf import settings

es = Elasticsearch(settings.ELASTICSEARCH_URL)

INDEX_NAME = 'products'


def create_index():
    if not es.indices.exists(index=INDEX_NAME):
        es.indices.create(index=INDEX_NAME, body={
            'mappings': {
                'properties': {
                    'name': {'type': 'text', 'analyzer': 'russian'},
                    'description': {'type': 'text', 'analyzer': 'russian'},
                    'price': {'type': 'float'},
                    'category': {'type': 'keyword'},
                    'status': {'type': 'keyword'},
                }
            }
        })


def index_product(product):
    es.index(index=INDEX_NAME, id=product.id, body={
        'name': product.name,
        'description': product.description,
        'price': float(product.price),
        'category': product.category.name if product.category else '',
        'status': product.status,
    })


def delete_product(product_id):
    es.delete(index=INDEX_NAME, id=product_id, ignore=[404])


def search_products(query, min_price=None, max_price=None, category=None):
    must = [{'multi_match': {'query': query, 'fields': ['name^2', 'description'], 'fuzziness': 'AUTO'}}]
    filters = [{'term': {'status': 'active'}}]

    if min_price is not None:
        filters.append({'range': {'price': {'gte': min_price}}})
    if max_price is not None:
        filters.append({'range': {'price': {'lte': max_price}}})
    if category:
        filters.append({'term': {'category': category}})

    result = es.search(index=INDEX_NAME, body={
        'query': {
            'bool': {
                'must': must,
                'filter': filters
            }
        }
    })

    return [int(hit['_id']) for hit in result['hits']['hits']]