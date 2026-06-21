"""Загрузка и управление фото товара (Ф12, узел 2.3, этап 3).

Главная новая поверхность безопасности фазы (план 9, опасная тройка - файлы
третьих лиц видят все покупатели): белый список типа/расширения, проверка
реального содержимого через Pillow, лимит размера и количества (анти-DoS по
диску). Владение товаром проверяется во вьюхе (queryset по seller=request.user),
здесь - только валидация и операции с ProductImage.
"""
from django.db.models import Max
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.permissions import IsSeller
from .models import Product, ProductImage
from .serializers import ProductImageSerializer

MAX_IMAGE_SIZE = 5 * 1024 * 1024  # 5 МБ на файл (анти-DoS по диску)
MAX_IMAGES_PER_PRODUCT = 10
ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/webp', 'image/gif'}
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}


def _extension(name):
    import os
    return os.path.splitext(name or '')[1].lower()


def add_image(product, file):
    """Валидирует файл и создаёт ProductImage с инкрементным order.

    Невалидный файл -> ValidationError (вьюха отдаёт 400), не 500 и не запись
    мусора. Проверяем и заявленный content-type/расширение, и реальное
    содержимое (Pillow), чтобы .png с произвольными байтами не прошёл.
    """
    if file is None:
        raise serializers.ValidationError({'image': 'Файл не передан'})
    if file.size > MAX_IMAGE_SIZE:
        raise serializers.ValidationError(
            {'image': f'Файл больше {MAX_IMAGE_SIZE // (1024 * 1024)} МБ'}
        )
    if file.content_type not in ALLOWED_IMAGE_TYPES or _extension(file.name) not in ALLOWED_EXTENSIONS:
        raise serializers.ValidationError({'image': 'Допустимы только изображения (jpg, png, webp, gif)'})

    # Реальное содержимое - изображение (не доверяем имени/типу).
    from PIL import Image
    try:
        Image.open(file).verify()
    except Exception:
        raise serializers.ValidationError({'image': 'Файл не является изображением'})
    file.seek(0)  # verify() сдвигает курсор - возвращаем в начало перед сохранением

    if product.images.count() >= MAX_IMAGES_PER_PRODUCT:
        raise serializers.ValidationError(
            {'image': f'Не больше {MAX_IMAGES_PER_PRODUCT} фото на товар'}
        )

    next_order = (product.images.aggregate(m=Max('order'))['m'] or 0) + 1
    return ProductImage.objects.create(product=product, image=file, order=next_order)


def reorder_images(product, ordered_ids):
    """Проставляет order по позиции в списке id. Чужие/несуществующие id молча
    игнорируются (берём только фото этого товара) - не падаем на мусоре."""
    if not isinstance(ordered_ids, list):
        raise serializers.ValidationError({'order': 'Ожидается список id'})
    own = {img.id: img for img in product.images.all()}
    for position, image_id in enumerate(ordered_ids):
        img = own.get(image_id)
        if img is not None:
            img.order = position
            img.save(update_fields=['order'])


class ProductImagesView(APIView):
    """POST - загрузить одно фото (multipart, поле image); PUT - переупорядочить
    (body {"order": [id, ...]}). Только продавец-владелец товара (404 на чужой)."""
    permission_classes = [IsSeller]

    def _get_product(self, request, pk):
        return get_object_or_404(Product, pk=pk, seller=request.user)

    def post(self, request, pk):
        product = self._get_product(request, pk)
        image = add_image(product, request.FILES.get('image'))
        return Response(ProductImageSerializer(image).data, status=201)

    def put(self, request, pk):
        product = self._get_product(request, pk)
        reorder_images(product, request.data.get('order'))
        images = product.images.all()
        return Response(ProductImageSerializer(images, many=True).data)


class ProductImageDetailView(APIView):
    """DELETE - удалить фото своего товара (404 на чужое)."""
    permission_classes = [IsSeller]

    def delete(self, request, pk, image_id):
        image = get_object_or_404(
            ProductImage, pk=image_id, product__pk=pk, product__seller=request.user
        )
        image.delete()
        return Response(status=204)
