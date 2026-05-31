import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

import csv
import random
from datetime import datetime, timedelta
from apps.products.models import Product, Review
from apps.users.models import User

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

# Получаем пользователей
users = list(User.objects.filter(role='buyer'))
if not users:
    # Создаём тестовых покупателей
    for i in range(20):
        u, _ = User.objects.get_or_create(
            email=f'buyer{i+1}@market.com',
            defaults={'username': f'buyer{i+1}', 'role': 'buyer'}
        )
        if _:
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

random.shuffle(all_reviews)
review_index = 0
total_created = 0

for product, count in distribution:
    used_users = set()
    created = 0
    attempts = 0

    while created < count and attempts < count * 3:
        attempts += 1
        if review_index >= len(all_reviews):
            review_index = 0

        review_data = all_reviews[review_index]
        review_index += 1

        user = random.choice(users)
        if user.id in used_users:
            continue
        used_users.add(user.id)

        try:
            # Генерируем случайную дату за последние 2 года
            days_ago = random.randint(1, 730)
            created_at = datetime.now() - timedelta(days=days_ago)

            Review.objects.create(
                product=product,
                user=user,
                rating=review_data['rating'],
                text=review_data['text'],
                created_at=created_at
            )
            created += 1
            total_created += 1
        except Exception:
            continue

    if total_created % 500 == 0 and total_created > 0:
        print(f'Создано {total_created} отзывов...')

print(f'Готово! Создано {total_created} отзывов')