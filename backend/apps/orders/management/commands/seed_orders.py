import os
import random

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils.crypto import get_random_string

from apps.users.models import User
from apps.products.models import Product
from apps.orders.models import Order, OrderItem
from services.clickhouse_service import write_event

# Пароль сид-аккаунтов: из env SEED_PASSWORD, иначе случайный НЕИЗВЕСТНЫЙ - чтобы
# повторное сидирование не возвращало слабый дефолтный пароль на публичный прод.
SEED_PASSWORD = os.getenv('SEED_PASSWORD') or get_random_string(20)


class Command(BaseCommand):
    help = (
        'Сидирует историю заказов для матрицы ко-покупок (P8): создаёт покупателей и '
        'доставленные заказы из 2-4 товаров, пишет purchase-события в ClickHouse с '
        'order_id (без него матрица ко-покупок пуста - рекомендатель всегда уходит в '
        'fallback). Часть заказов одно-продавцовые, чтобы на демо продавец мог вести '
        'свои заказы (P2). Команда повторяемая (добавляет заказы); после прогона '
        'запусти build_recommendations для пересборки матрицы.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--orders', type=int, default=300, help='Сколько заказов создать')
        parser.add_argument('--buyers', type=int, default=20, help='Сколько покупателей создать')
        parser.add_argument('--single-share', type=float, default=0.6,
                            help='Доля одно-продавцовых заказов (для демо P2)')

    def handle(self, *args, **options):
        n_orders = options['orders']
        n_buyers = options['buyers']
        single_share = options['single_share']

        buyers = []
        for i in range(n_buyers):
            user, created = User.objects.get_or_create(
                email=f'buyer{i+1}@seed.local',
                defaults={'username': f'seed_buyer{i+1}', 'role': User.ROLE_BUYER},
            )
            if created:
                user.set_password(SEED_PASSWORD)
                user.save()
            buyers.append(user)

        # Товары с нужными полями одним запросом (без N+1 на product_name).
        active = list(
            Product.objects.filter(status='active')
            .values('id', 'seller_id', 'price', 'name')
        )
        if len(active) < 4:
            self.stderr.write(self.style.ERROR(
                'Недостаточно активных товаров для сида заказов (нужно >= 4). '
                'Сначала импортируй товары.'
            ))
            return

        by_seller = {}
        for p in active:
            by_seller.setdefault(p['seller_id'], []).append(p)
        sellers_with_enough = [sid for sid, pool in by_seller.items() if len(pool) >= 2]

        created_orders = 0
        ch_events = 0
        for _ in range(n_orders):
            buyer = random.choice(buyers)

            # Одно-продавцовый заказ (для P2) - если есть продавец с >=2 товарами.
            if sellers_with_enough and random.random() < single_share:
                pool = by_seller[random.choice(sellers_with_enough)]
            else:
                pool = active

            k = random.randint(2, 4)
            items_src = random.sample(pool, min(k, len(pool)))

            with transaction.atomic():
                total = sum(float(p['price']) for p in items_src)
                order = Order.objects.create(
                    buyer=buyer,
                    delivery_address='г. Москва, ул. Тестовая, д. 1',
                    total_price=total,
                    status=Order.STATUS_DELIVERED,
                )
                OrderItem.objects.bulk_create([
                    OrderItem(
                        order=order,
                        product_id=p['id'],
                        product_name=p['name'],
                        quantity=1,
                        price_at_purchase=p['price'],
                    )
                    for p in items_src
                ])

            # purchase-события в ClickHouse с order_id - источник матрицы ко-покупок.
            for p in items_src:
                write_event('purchase', buyer.id, p['id'], order.id)
                ch_events += 1
            created_orders += 1

        self.stdout.write(self.style.SUCCESS(
            f'Создано заказов: {created_orders}, покупателей: {len(buyers)}, '
            f'purchase-событий в ClickHouse: {ch_events}.\n'
            f'Дальше: python manage.py build_recommendations'
        ))
