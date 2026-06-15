from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0002_otpcode'),
    ]

    operations = [
        migrations.AddField(
            model_name='otpcode',
            name='attempts',
            field=models.PositiveSmallIntegerField(default=0),
        ),
    ]
