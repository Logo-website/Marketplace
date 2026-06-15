from django.db import migrations, models


def backfill_shop_name(apps, schema_editor):
    """Для продавцов без shop_name проставляем username как стартовое
    публичное имя - чтобы каталог не показывал пустую строку вместо email.
    Бэкофилл живёт в миграции (а не в одноразовом скрипте) - тот же
    прецедент, что 0006_backfill_product_rating в products."""
    User = apps.get_model('users', 'User')
    sellers = User.objects.filter(role='seller').exclude(username='')
    for user in sellers.iterator():
        if not user.shop_name:
            user.shop_name = user.username
            user.save(update_fields=['shop_name'])


def noop_reverse(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0003_otpcode_attempts'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='shop_name',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.RunPython(backfill_shop_name, noop_reverse),
    ]
