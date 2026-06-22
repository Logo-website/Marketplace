# Ф13: статус 'rejected' для вкладки/бейджа «отклонён» (узел 2.2).

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0009_product_old_price_alter_product_status'),
    ]

    operations = [
        migrations.AlterField(
            model_name='product',
            name='status',
            field=models.CharField(choices=[('active', 'Активен'), ('hidden', 'Скрыт'), ('moderation', 'На модерации'), ('rejected', 'Отклонён'), ('draft', 'Черновик')], db_index=True, default='moderation', max_length=20),
        ),
    ]
