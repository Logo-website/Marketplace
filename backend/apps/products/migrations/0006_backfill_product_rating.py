# Бэкофилл денормализованного рейтинга (P6a).
# Считает Product.rating/reviews_count из реальных строк Review одним проходом.
# Заменяет одноразовый скрипт (правило репо №3 - удалять нечего, миграция постоянна).
from django.db import migrations
from django.db.models import Avg, Count


def backfill_ratings(apps, schema_editor):
    Product = apps.get_model('products', 'Product')
    Review = apps.get_model('products', 'Review')
    rows = Review.objects.values('product_id').annotate(
        avg=Avg('rating'), cnt=Count('id')
    )
    for row in rows:
        Product.objects.filter(id=row['product_id']).update(
            rating=round(row['avg'], 2) if row['avg'] is not None else 0,
            reviews_count=row['cnt'],
        )


def noop(apps, schema_editor):
    # Откат не нужен: rating/reviews_count исчезают вместе с колонками при reverse 0005.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0005_product_rating_product_reviews_count_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill_ratings, noop),
    ]
