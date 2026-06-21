from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0004_orderitem_size_color'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='recipient_name',
            field=models.CharField(blank=True, default='', max_length=200),
        ),
        migrations.AddField(
            model_name='order',
            name='recipient_phone',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='order',
            name='recipient_email',
            field=models.EmailField(blank=True, default='', max_length=254),
        ),
        migrations.AddField(
            model_name='order',
            name='delivery_method',
            field=models.CharField(
                choices=[('pickup', 'Самовывоз'), ('courier', 'Курьер'), ('post', 'Почта России')],
                default='pickup', max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='order',
            name='payment_method',
            field=models.CharField(
                choices=[('card', 'Картой онлайн'), ('on_delivery', 'При получении'), ('installments', 'Частями')],
                default='card', max_length=20,
            ),
        ),
    ]
