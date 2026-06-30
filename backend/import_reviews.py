import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

import csv
import random
from datetime import timedelta
from django.utils import timezone
from apps.products.models import Product, Review
from apps.users.models import User

# Отключаем сигналы пересчёта рейтинга на время сидирования: при поштучном
# delete/save они дёргают агрегаты на КАЖДУЮ строку, и на удалённой Neon это
# тянется вечно (а само удаление перестаёт быть быстрым SQL DELETE). Рейтинг
# пересчитываем сами одним bulk_update в конце.
from django.db.models.signals import post_save, post_delete
from apps.products import signals as product_signals
post_save.disconnect(product_signals.review_saved, sender=Review)
post_delete.disconnect(product_signals.review_deleted, sender=Review)

print('Очищаем старые отзывы...')
Review.objects.all().delete()

print('Читаем отзывы из CSV...')
with open('reviews.csv', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    all_reviews = [
        {
            'text': row.get('reviewText', '').strip(),
            'title': row.get('reviewTitle', '').strip(),
            'rating': int(row.get('rating', 5)),
            'date': row.get('reviewMetadata', '').strip(),
        }
        for row in reader
        if row.get('reviewText', '').strip()
    ]

print(f'Найдено {len(all_reviews)} отзывов')

# Пул отзывов формируем ТОЛЬКО из тестовых покупателей. Берём не всех buyer'ов
# подряд: иначе реальные зарегистрированные пользователи (например владелец) получат
# фейковые отзывы на купленные ими товары. И гарантируем именно 20 аккаунтов, чтобы
# распределение не схлопнулось до 1 отзыва на товар, когда реальный buyer всего один.
users = []
for i in range(20):
    u, created_user = User.objects.get_or_create(
        email=f'buyer{i+1}@market.com',
        defaults={'username': f'buyer{i+1}', 'role': 'buyer'}
    )
    if created_user:
        u.set_password('Buyer123!')
        u.save()
    users.append(u)

print(f'Пользователей: {len(users)}')

products = list(Product.objects.filter(status='active'))
random.shuffle(products)
print(f'Товаров: {len(products)}')

# Распределение отзывов
distribution = []

# 20 товаров — 50-60 отзывов
for p in products[:20]:
    distribution.append((p, random.randint(50, 60)))

# 40 товаров — 30-39 отзывов
for p in products[20:60]:
    distribution.append((p, random.randint(30, 39)))

# 100 товаров — 10-20 отзывов
for p in products[60:160]:
    distribution.append((p, random.randint(10, 20)))

# 200 товаров — 3-9 отзывов
for p in products[160:360]:
    distribution.append((p, random.randint(3, 9)))

# 200 товаров — 1-2 отзыва
for p in products[360:560]:
    distribution.append((p, random.randint(1, 2)))

# Остальные — без отзывов

# Быстрая пакетная вставка. Собираем все объекты Review в память и вставляем
# bulk_create - сигнал пересчёта рейтинга при bulk_create НЕ срабатывает, поэтому
# рейтинг считаем сами и пишем одним bulk_update. На удалённой Neon это секунды,
# а не часы (поштучный create + recalc на каждый отзыв тянулся вечно).
random.shuffle(all_reviews)
review_index = 0
to_create = []

for product, count in distribution:
    # unique_together (product, user): на товар не больше одного отзыва от юзера,
    # значит и не больше len(users) отзывов на товар.
    n = min(count, len(users))
    for user in random.sample(users, n):
        review_data = all_reviews[review_index % len(all_reviews)]
        review_index += 1
        to_create.append(Review(
            product=product,
            user=user,
            rating=review_data['rating'],
            text=review_data['text'],
        ))

print(f'Вставляем {len(to_create)} отзывов одной пачкой...')
Review.objects.bulk_create(to_create, batch_size=500)

# created_at - auto_now_add, bulk_create проставил "сейчас". Разносим даты за
# последние 2 года отдельным bulk_update (он обходит auto_now_add).
now = timezone.now()
for r in to_create:
    r.created_at = now - timedelta(days=random.randint(1, 730))
Review.objects.bulk_update(to_create, ['created_at'], batch_size=500)

# Денормализованные Product.rating/reviews_count считаем в памяти (сигнал при
# bulk_create не сработал) и пишем одним bulk_update по всем товарам. Товары без
# отзывов -> rating 0, count 0.
sums, counts = {}, {}
for r in to_create:
    sums[r.product_id] = sums.get(r.product_id, 0) + r.rating
    counts[r.product_id] = counts.get(r.product_id, 0) + 1
for p in products:
    c = counts.get(p.id, 0)
    p.rating = round(sums[p.id] / c, 2) if c else 0
    p.reviews_count = c
Product.objects.bulk_update(products, ['rating', 'reviews_count'], batch_size=500)

print(f'Готово! Создано {len(to_create)} отзывов')