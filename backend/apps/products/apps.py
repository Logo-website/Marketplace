from django.apps import AppConfig


class ProductsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.products'

    def ready(self):
        from . import signals  # noqa: F401 - регистрация сигналов рейтинга/кэша (P6)
        try:
            from .search import create_index
            create_index()
        except Exception:
            pass
        try:
            from services.clickhouse_service import init_events_table
            init_events_table()
        except Exception:
            pass