from rest_framework import views, status
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from rest_framework import serializers
from apps.products.models import Product
from .cart import get_cart, add_to_cart, remove_from_cart, clear_cart


class CartItemSerializer(serializers.Serializer):
    product_id = serializers.IntegerField()
    quantity = serializers.IntegerField(min_value=1)


class CartView(views.APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cart = get_cart(request.user.id)
        product_ids = list(cart.keys())
        products = Product.objects.filter(id__in=product_ids)
        items = []
        total = 0
        for product in products:
            quantity = cart[str(product.id)]
            item_total = product.price * quantity
            total += item_total
            items.append({
                'product_id': product.id,
                'name': product.name,
                'price': str(product.price),
                'quantity': quantity,
                'total': str(item_total)
            })
        return Response({'items': items, 'total': str(total)})

    def post(self, request):
        serializer = CartItemSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        product_id = serializer.validated_data['product_id']
        quantity = serializer.validated_data['quantity']

        try:
            product = Product.objects.get(id=product_id, status='active')
        except Product.DoesNotExist:
            return Response({'error': 'Товар не найден'}, status=status.HTTP_404_NOT_FOUND)

        cart = get_cart(request.user.id)
        current_quantity = cart.get(str(product_id), 0)
        if current_quantity + quantity > product.stock:
            return Response(
                {'error': f'Недостаточно товара на складе. Доступно: {product.stock}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        cart = add_to_cart(request.user.id, product_id, quantity)
        return Response({'cart': cart})

    def delete(self, request):
        product_id = request.data.get('product_id')
        if product_id:
            cart = remove_from_cart(request.user.id, product_id)
            return Response({'cart': cart})
        clear_cart(request.user.id)
        return Response({'message': 'Корзина очищена'})