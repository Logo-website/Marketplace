# Ф4: фикс Review.created_at.
# Раньше поле было auto_now_add=False, default=None, null=True - отзыв,
# созданный через API (serializer.save() даты не передаёт), получал
# created_at=None. Это ломало ordering=['-created_at'] и new Date() на фронте.
# 1) Бэкофилл: существующим NULL-датам ставим now() (иначе AlterField на
#    NOT NULL упадёт на старых строках).
# 2) Меняем поле на auto_now_add=True (NOT NULL).
from django.db import migrations, models
from django.utils import timezone


def backfill_created_at(apps, schema_editor):
    Review = apps.get_model('products', 'Review')
    Review.objects.filter(created_at__isnull=True).update(created_at=timezone.now())


def noop(apps, schema_editor):
    # Откат не нужен: значения дат при reverse не восстановить (и не нужно).
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0006_backfill_product_rating'),
    ]

    operations = [
        migrations.RunPython(backfill_created_at, noop),
        migrations.AlterField(
            model_name='review',
            name='created_at',
            field=models.DateTimeField(auto_now_add=True),
        ),
    ]
