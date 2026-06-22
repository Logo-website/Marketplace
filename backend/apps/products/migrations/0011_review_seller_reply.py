# Ф15: ответ продавца на отзыв (узел 2.8) - 1:1 поля на Review.

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('products', '0010_alter_product_status_rejected'),
    ]

    operations = [
        migrations.AddField(
            model_name='review',
            name='seller_reply',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='review',
            name='seller_reply_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
