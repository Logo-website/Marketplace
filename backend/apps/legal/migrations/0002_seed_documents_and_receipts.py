import hashlib
from datetime import date

from django.db import migrations


# Стартовый набor из 5 обязательных документов (узел 1.20). Текст - заготовка-рыба
# для учебного проекта; реальный юр-текст пишет владелец/юрист и правит в админке
# без передеплоя. Дата вступления в силу/версия живут в данных (правило репо №1).
EFFECTIVE = date(2026, 6, 1)

DOCUMENTS = [
    {
        'slug': 'oferta',
        'title': 'Публичная оферта',
        'body': (
            'Настоящая публичная оферта определяет условия использования площадки '
            'Marketplace и правила взаимодействия покупателей и продавцов.\n\n'
            '1. Площадка предоставляет сервис для размещения и продажи товаров.\n'
            '2. Продавец несёт ответственность за достоверность описаний и качество товара.\n'
            '3. Покупатель оформляет заказ, принимая настоящие условия.\n\n'
            'Это учебный проект: текст оферты является заготовкой и подлежит замене '
            'юридически корректной редакцией.'
        ),
    },
    {
        'slug': 'privacy',
        'title': 'Политика конфиденциальности (152-ФЗ)',
        'body': (
            'Политика обработки персональных данных в соответствии с 152-ФЗ.\n\n'
            'Мы обрабатываем имя, контактные данные и историю заказов исключительно '
            'для исполнения договора и информирования о статусе заказов.\n'
            'Данные не передаются третьим лицам, кроме случаев, предусмотренных законом.\n'
            'Пользователь вправе запросить доступ к своим данным и их удаление.\n\n'
            'Это учебный проект: текст политики является заготовкой.'
        ),
    },
    {
        'slug': 'delivery-returns',
        'title': 'Условия доставки и возврата',
        'body': (
            'Условия доставки заказов и возврата товаров.\n\n'
            'Доставка осуществляется выбранным при оформлении способом.\n'
            'Возврат товара надлежащего качества возможен в течение установленного '
            'срока с даты доставки через раздел «Возвраты» в личном кабинете.\n'
            'Механика и сроки возврата описаны в интерфейсе оформления заявки.\n\n'
            'Это учебный проект: текст является заготовкой.'
        ),
    },
    {
        'slug': 'about',
        'title': 'О компании',
        'body': (
            'Marketplace - мультивендорная площадка одежды: локальные бренды и частные '
            'продавцы в одном месте.\n\n'
            'Это учебно-портфельный проект, демонстрирующий устройство маркетплейса.'
        ),
    },
    {
        'slug': 'contacts',
        'title': 'Контакты',
        'body': (
            'Связаться с площадкой:\n\n'
            'Поддержка: раздел «Чаты» -> поддержка, или «Помощь и FAQ».\n'
            'E-mail: support@marketplace.example\n\n'
            'Это учебный проект: контактные данные являются заготовкой.'
        ),
    },
]


def _digits(seed, length):
    """Та же детерминированная генерация, что в services.generate_receipt -
    миграция самодостаточна и не импортирует прикладной код."""
    num = str(int(hashlib.sha256(seed.encode()).hexdigest(), 16))
    return (num * length)[:length] if len(num) < length else num[:length]


def seed_forward(apps, schema_editor):
    LegalDocument = apps.get_model('legal', 'LegalDocument')
    Receipt = apps.get_model('legal', 'Receipt')
    Order = apps.get_model('orders', 'Order')

    for doc in DOCUMENTS:
        LegalDocument.objects.update_or_create(
            slug=doc['slug'],
            defaults={
                'title': doc['title'],
                'body': doc['body'],
                'version': '1.0',
                'effective_date': EFFECTIVE,
                'is_published': True,
            },
        )

    # Backfill: у заказов, созданных до Ф26, чека нет - дочиняем по тем же
    # детерминированным реквизитам. get_or_create идемпотентен (повтор не плодит).
    for order in Order.objects.filter(receipt__isnull=True):
        Receipt.objects.get_or_create(
            order=order,
            defaults={
                'fn_number': _digits(f'fn-{order.id}', 16),
                'fd_number': _digits(f'fd-{order.id}', 10),
                'fiscal_sign': _digits(f'fp-{order.id}', 10),
                'total': order.total_price,
                'is_emulated': True,
            },
        )


def seed_reverse(apps, schema_editor):
    LegalDocument = apps.get_model('legal', 'LegalDocument')
    LegalDocument.objects.filter(slug__in=[d['slug'] for d in DOCUMENTS]).delete()
    # Receipt откатывается удалением таблицы в 0001 reverse - вручную не трогаем.


class Migration(migrations.Migration):

    dependencies = [
        ('legal', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_forward, seed_reverse),
    ]
