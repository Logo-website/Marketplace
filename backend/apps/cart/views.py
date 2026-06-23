from rest_framework import views, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import serializers
from apps.products.models import Product
from .cart import (
    get_cart, save_cart, set_cart_quantity, remove_from_cart,
    clear_cart, cart_key, parse_cart_key, try_add,
)


def _first_image_url(product):
    img = product.images.first()
    if not img:
        return None
    return img.image_url or (img.image.url if img.image else None)


def build_cart_items(cart):
    """Собирает позиции корзины из сырого dict (составные ключи -> количество).

    - Товары достаются ОДНИМ запросом (no N+1), seller через select_related.
    - Размер/цвет берутся из составного ключа (cart_key/parse_cart_key).
    - Снятый/удалённый товар пропускается (товар протух между добавлением и
      просмотром) - в выдаче его нет, фронт почистит свою копию.
    Возвращает (items, total).
    """
    parsed = {}  # product_id -> [(key, size, color, qty), ...]
    for key, qty in cart.items():
        try:
            pid, size, color = parse_cart_key(key)
        except (ValueError, TypeError):
            continue  # битый ключ - пропускаем, не валим корзину
        parsed.setdefault(pid, []).append((size, color, qty))

    products = {
        p.id: p
        for p in Product.objects.filter(id__in=list(parsed.keys()), status='active')
        .select_related('seller').prefetch_related('images')
    }

    items = []
    total = 0
    for pid, lines in parsed.items():
        product = products.get(pid)
        if not product:
            continue  # снят/удалён/неактивен - не показываем
        image_url = _first_image_url(product)
        seller = product.seller
        seller_name = (seller.shop_name or seller.username) if seller else ''
        for size, color, qty in lines:
            item_total = product.price * qty
            total += item_total
            items.append({
                'product_id': product.id,
                'size': size,
                'color': color,
                'name': product.name,
                'price': str(product.price),
                'quantity': qty,
                'total': str(item_total),
                'image': image_url,
                'stock': product.stock,
                'seller_id': product.seller_id,
                'seller_name': seller_name,
            })
    return items, total


class CartItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)
    size = serializers.CharField(required=False, allow_blank=True, default='')
    color = serializers.CharField(required=False, allow_blank=True, default='')


class CartView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cart = get_cart(request.user.id)
        items, total = build_cart_items(cart)
        return Response({'items': items, 'total': str(total)})

    def post(self, request):
        """Добавить позицию (суммирует количество для того же product+вариант)."""
        serializer = CartItemSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        # Валидация active+остаток вынесена в cart.try_add (общая с батчем Ф22).
        result = try_add(request.user.id, data['product_id'], data['quantity'],
                         data['size'], data['color'])
        if result['reason'] == 'not_found':
            return Response({'error': 'Товар не найден'}, status=status.HTTP_404_NOT_FOUND)
        if result['reason'] == 'out_of_stock':
            return Response(
                {'error': f'Недостаточно товара на складе. Доступно: {result["stock"]}'},
                status=status.HTTP_400_BAD_REQUEST
            )
        return Response({'cart': get_cart(request.user.id)})

    def put(self, request):
        """Установить точное количество позиции (кнопки +/-). Атомарный set,
        а не delete+post: при отказе по стоку позиция не теряется."""
        serializer = CartItemSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        data = serializer.validated_data
        product_id = data['product_id']
        quantity = data['quantity']

        try:
            product = Product.objects.get(id=product_id, status='active')
        except Product.DoesNotExist:
            return Response({'error': 'Товар не найден'}, status=status.HTTP_404_NOT_FOUND)

        if quantity > product.stock:
            return Response(
                {'error': f'Недостаточно товара на складе. Доступно: {product.stock}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        key = cart_key(product_id, data['size'], data['color'])
        set_cart_quantity(request.user.id, key, quantity)
        return Response({'cart': get_cart(request.user.id)})

    def delete(self, request):
        product_id = request.data.get('product_id')
        if product_id:
            size = request.data.get('size', '') or ''
            color = request.data.get('color', '') or ''
            key = cart_key(product_id, size, color)
            cart = remove_from_cart(request.user.id, key)
            return Response({'cart': cart})
        clear_cart(request.user.id)
        return Response({'message': 'Корзина очищена'})


class CartMergeView(views.APIView):
    """Слияние гостевой корзины (localStorage) в серверную при входе (Ф8).

    Принимает ``items: [{product_id, size, color, quantity}]``. Для каждой
    позиции суммирует к серверной, но ОБРЕЗАЕТ по стоку (не reject): наивный
    цикл POST потерял бы позиции с превышением. Снятые/недоступные товары
    пропускаются. Возвращает собранную корзину - фронт сразу её отрисует.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        guest_items = request.data.get('items', [])
        if not isinstance(guest_items, list):
            return Response({'error': 'Некорректный формат корзины'}, status=400)

        cart = get_cart(request.user.id)

        # Товары одним запросом - без N+1 при слиянии большой гостевой корзины.
        ids = []
        for it in guest_items:
            try:
                ids.append(int(it.get('product_id')))
            except (TypeError, ValueError):
                continue
        products = {
            p.id: p for p in Product.objects.filter(id__in=ids, status='active')
        }

        for it in guest_items:
            try:
                product_id = int(it.get('product_id'))
                qty = int(it.get('quantity', 1))
            except (TypeError, ValueError):
                continue
            if qty < 1:
                continue
            product = products.get(product_id)
            if not product or product.stock < 1:
                continue  # снят/распродан - пропускаем
            size = it.get('size', '') or ''
            color = it.get('color', '') or ''
            key = cart_key(product_id, size, color)
            # суммируем к существующему, но не больше стока
            merged = min(cart.get(key, 0) + qty, product.stock)
            cart[key] = merged

        save_cart(request.user.id, cart)

        items, total = build_cart_items(cart)
        return Response({'items': items, 'total': str(total)})
