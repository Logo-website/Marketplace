import os
import django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

import csv
import random
import ast
from apps.users.models import User
from apps.products.models import Category, Product, ProductImage

print('Очищаем старые данные...')
ProductImage.objects.all().delete()
Product.objects.all().delete()
Category.objects.all().delete()

print('Создаём продавцов...')
sellers = []
for i in range(5):
    email = f'seller{i+1}@marketplace.com'
    seller, created = User.objects.get_or_create(
        email=email,
        defaults={'username': f'seller{i+1}', 'role': 'seller'}
    )
    if created:
        seller.set_password('Seller123!')
        seller.save()
    sellers.append(seller)

# Маппинг английских категорий на русские
CATEGORY_MAP = {
    'Active': 'Спортивная одежда',
    'Athletic': 'Спортивная одежда',
    'Jeans': 'Джинсы',
    'Tops, Tees & Blouses': 'Футболки и блузки',
    'Tops, Tees & Shirts': 'Футболки и блузки',
    'Shirts': 'Рубашки',
    'Underwear': 'Нижнее бельё',
    'Pants': 'Брюки',
    'Jackets & Coats': 'Куртки и пальто',
    'Outerwear': 'Куртки и пальто',
    'Dresses': 'Платья',
    'Fashion Sneakers': 'Кроссовки',
    'Shoes': 'Обувь',
    'Loafers & Slip-Ons': 'Обувь',
    'Flats': 'Обувь',
    'Oxfords': 'Обувь',
    'Pumps': 'Обувь',
    'Mules & Clogs': 'Обувь',
    'Sandals': 'Обувь',
    'Shorts': 'Шорты',
    'Suits & Sport Coats': 'Костюмы',
    'Sleep & Lounge': 'Домашняя одежда',
    'Sleepwear & Robes': 'Домашняя одежда',
    'Lingerie, Sleep & Lounge': 'Домашняя одежда',
    'Swim': 'Купальники',
    'Swimsuits & Cover Ups': 'Купальники',
    'Fashion Hoodies & Sweatshirts': 'Толстовки',
    'Socks & Hosiery': 'Носки',
    'Belts': 'Аксессуары',
    'Accessories': 'Аксессуары',
    'Novelty': 'Другое',
    'Clothing': 'Другое',
    'Men': 'Другое',
    'Women': 'Другое',
    'Boys': 'Другое',
    'Costumes & Cosplay Apparel': 'Другое',
    'Jumpsuits, Rompers & Overalls': 'Комбинезоны',
    'Bags, Cases & Sleeves': 'Сумки',
}

print('Создаём категории из CSV...')
with open('products.csv', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    all_rows = list(reader)

# Собираем уникальные русские категории
russian_categories = set()
for row in all_rows:
    b = row.get('breadcrumbs', '').strip()
    if b:
        parts = [p.strip() for p in b.split('›')]
        eng_cat = parts[3] if len(parts) >= 4 else (parts[2] if len(parts) >= 3 else '')
        rus_cat = CATEGORY_MAP.get(eng_cat, 'Другое')
        russian_categories.add(rus_cat)

categories_db = {}
for i, name in enumerate(sorted(russian_categories)):
    cat, _ = Category.objects.get_or_create(
        slug=f'cat-{i+1}',
        defaults={'name': name}
    )
    categories_db[name] = cat

print(f'Создано {len(categories_db)} категорий: {list(categories_db.keys())}')

def get_category(breadcrumbs):
    if breadcrumbs:
        parts = [p.strip() for p in breadcrumbs.split('›')]
        eng_cat = parts[3] if len(parts) >= 4 else (parts[2] if len(parts) >= 3 else '')
        rus_cat = CATEGORY_MAP.get(eng_cat, 'Другое')
        return categories_db.get(rus_cat, list(categories_db.values())[0])
    return list(categories_db.values())[0]

def parse_price(price_str):
    if not price_str:
        return random.randint(1000, 15000)
    price_str = str(price_str).replace('$', '').replace(',', '').replace('List Price:', '').replace('Typical price:', '').strip()
    try:
        return round(float(price_str) * 90)
    except:
        return random.randint(1000, 15000)

print(f'Найдено {len(all_rows)} товаров')
print('Импортируем товары...')

count = 0
for i, row in enumerate(all_rows):
    try:
        name = row.get('title', '').strip()[:255]
        if not name:
            continue

        description = row.get('about_item', '') or row.get('product_description', '')
        description = description.strip()[:1000]

        price = parse_price(row.get('price_value', '') or row.get('list_price', ''))
        breadcrumbs = row.get('breadcrumbs', '')
        category = get_category(breadcrumbs)

        try:
            rating_str = str(row.get('rating_stars', '0')).split()[0]
            rating = float(rating_str)
        except:
            rating = 0.0

        try:
            reviews = int(str(row.get('rating_count', '0')).replace(',', '').replace(' ratings', '').strip())
        except:
            reviews = 0

        brand = row.get('brand_name', '') or row.get('seller_name', '')

        slug = f'product-v3-{i+1}'
        product, created = Product.objects.get_or_create(
            slug=slug,
            defaults={
                'seller': random.choice(sellers),
                'category': category,
                'name': name,
                'description': description,
                'price': price,
                'stock': random.randint(1, 100),
                'status': 'active',
                'attributes': {
                    'rating': rating,
                    'reviews': reviews,
                    'brand': brand,
                },
            }
        )

        if created:
            images_str = row.get('all_images', '')
            if images_str:
                try:
                    images = ast.literal_eval(images_str)
                    for j, img_url in enumerate(images[:3]):
                        if img_url and 'play-button' not in img_url:
                            ProductImage.objects.create(
                                product=product,
                                image_url=img_url,
                                order=j
                            )
                except:
                    pass

        count += 1
        if count % 100 == 0:
            print(f'Импортировано {count} товаров...')
    except Exception as e:
        print(f'Ошибка в строке {i}: {e}')
        continue

print(f'Готово! Импортировано {count} товаров')