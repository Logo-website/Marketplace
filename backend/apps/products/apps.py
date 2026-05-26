from django.apps import AppConfig


class ProductsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.products'

    def ready(self):
        try:
            from .search import create_index
            create_index()
        except Exception:
            pass
        try:
            from clickhouse import init_clickhouse
            init_clickhouse()
        except Exception:
            pass