from django.core.management.base import BaseCommand

from apps.products.models import Product
from apps.products.search import INDEX_NAME, get_es, create_index, index_product


class Command(BaseCommand):
    help = (
        'Пересоздаёт ES-индекс products и индексирует все товары. '
        'Нужно после изменения маппинга (например, добавления category_id для фасетов).'
    )

    def handle(self, *args, **options):
        es = get_es()
        es.indices.delete(index=INDEX_NAME, ignore=[404])
        create_index()

        count = 0
        for product in Product.objects.select_related('category').iterator():
            index_product(product)
            count += 1

        self.stdout.write(self.style.SUCCESS(f'Переиндексировано товаров: {count}'))
