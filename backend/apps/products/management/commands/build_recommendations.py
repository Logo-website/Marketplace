from django.core.management.base import BaseCommand

from apps.products.tasks import build_copurchase_matrix


class Command(BaseCommand):
    help = (
        'Пересчитывает матрицу ко-покупок из ClickHouse и пишет её в общий файл '
        '(volume), который читает C++-рекомендатель. В проде то же делает '
        'периодическая Celery-задача build_copurchase_matrix; команда нужна для '
        'демо и для прогона сразу после сида заказов (seed_orders).'
    )

    def handle(self, *args, **options):
        count = build_copurchase_matrix()
        self.stdout.write(self.style.SUCCESS(
            f'Матрица ко-покупок пересчитана: товаров с рекомендациями {count}'
        ))
