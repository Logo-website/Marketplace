"""Тонкая обёртка над Django-кэшем с graceful-деградацией (P6b).

Если Redis недоступен, кэш-операция не должна ронять HTTP-запрос:
промах/ошибка кэша = просто идём в БД. Django-бэкенд RedisCache по умолчанию
пробрасывает исключение соединения наружу (500), поэтому глушим его здесь.
"""
import logging

from django.core.cache import cache

logger = logging.getLogger(__name__)


def cache_get(key):
    try:
        return cache.get(key)
    except Exception as e:
        logger.warning(f'Cache get failed for {key}: {e}')
        return None


def cache_set(key, value, timeout):
    try:
        cache.set(key, value, timeout)
    except Exception as e:
        logger.warning(f'Cache set failed for {key}: {e}')


def cache_delete(key):
    try:
        cache.delete(key)
    except Exception as e:
        logger.warning(f'Cache delete failed for {key}: {e}')
