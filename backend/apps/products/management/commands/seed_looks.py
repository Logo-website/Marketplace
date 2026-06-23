"""Демо-образы для лукбука (Ф22, узел 1.23).

Источник данных образов - редакция/бренды через админку (план §3). Эта команда
наполняет ленту демонстрационными образами из уже существующих активных товаров,
чтобы фичу можно было увидеть и проверить (как seed_orders для матрицы рекомендаций).
Идемпотентна: повторный запуск не плодит дубли (get_or_create по title).

Запуск: python manage.py seed_looks
"""
from django.core.management.base import BaseCommand
from apps.products.models import Look, LookItem, Product


class Command(BaseCommand):
    help = 'Сидит демо-образы лукбука из активных товаров (Ф22)'

    # Сколько вещей класть в один образ и сколько образов завести.
    ITEMS_PER_LOOK = 3
    EDITORIAL_LOOKS = 3

    def handle(self, *args, **options):
        active = list(
            Product.objects.filter(status='active')
            .select_related('seller').order_by('id')
        )
        if len(active) < self.ITEMS_PER_LOOK:
            self.stdout.write(self.style.WARNING(
                'Мало активных товаров для образов - сначала наполните каталог.'
            ))
            return

        created = 0

        # Редакционные образы (source=editorial, seller=null): нарезаем товары
        # подряд по ITEMS_PER_LOOK.
        for i in range(self.EDITORIAL_LOOKS):
            chunk = active[i * self.ITEMS_PER_LOOK:(i + 1) * self.ITEMS_PER_LOOK]
            if len(chunk) < self.ITEMS_PER_LOOK:
                break
            created += self._make_look(
                title=f'Образ редакции №{i + 1}', source='editorial', seller=None,
                description='Готовый комплект от стилистов площадки.', products=chunk,
            )

        # По одному брендовому образу на продавца, у кого хватает своих активных
        # товаров (source=brand, привязан к seller - показывается на витрине Ф20).
        by_seller = {}
        for p in active:
            by_seller.setdefault(p.seller_id, []).append(p)
        for seller_id, items in by_seller.items():
            if len(items) < self.ITEMS_PER_LOOK:
                continue
            seller = items[0].seller
            name = seller.shop_name or seller.username
            created += self._make_look(
                title=f'Образ бренда {name}', source='brand', seller=seller,
                description=f'Комплект из вещей бренда {name}.',
                products=items[:self.ITEMS_PER_LOOK],
            )

        self.stdout.write(self.style.SUCCESS(f'Готово. Создано образов: {created}'))

    def _make_look(self, title, source, seller, description, products):
        look, was_created = Look.objects.get_or_create(
            title=title,
            defaults={'source': source, 'seller': seller,
                      'description': description, 'is_published': True},
        )
        if not was_created:
            return 0
        for order, product in enumerate(products):
            LookItem.objects.create(look=look, product=product, order=order)
        return 1
