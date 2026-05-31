from rest_framework import generics, permissions, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from .models import Category, Product
from .serializers import CategorySerializer, ProductSerializer, ProductCreateSerializer
from .search import search_products, index_product, delete_product
from clickhouse import track_event
from apps.permissions import IsSeller
import urllib.request
import json
import logging
from .serializers import CategorySerializer, ProductSerializer, ProductCreateSerializer, ReviewSerializer, ReviewCreateSerializer
from .models import Category, Product, Review

logger = logging.getLogger(__name__)


class CategoryListView(generics.ListAPIView):
    queryset = Category.objects.filter(parent=None)
    serializer_class = CategorySerializer
    permission_classes = [permissions.AllowAny]


class ProductListView(generics.ListAPIView):
    serializer_class = ProductSerializer
    permission_classes = [permissions.AllowAny]
    filter_backends = [filters.OrderingFilter, filters.SearchFilter]
    ordering_fields = ['price', 'created_at']
    search_fields = ['name', 'description']

    def get_queryset(self):
        queryset = Product.objects.filter(status='active').select_related('category', 'seller').prefetch_related(
            'images')

        category_id = self.request.query_params.get('category')
        if category_id:
            queryset = queryset.filter(category_id=category_id)

        sort = self.request.query_params.get('sort', 'popular')
        if sort == 'price_asc':
            queryset = queryset.order_by('price')
        elif sort == 'price_desc':
            queryset = queryset.order_by('-price')
        elif sort == 'rating':
            queryset = queryset.order_by('-attributes__rating') if False else queryset.extra(
                select={'rating_val': "CAST(attributes->>'rating' AS FLOAT)"}
            ).order_by('-rating_val')
        elif sort == 'new':
            queryset = queryset.order_by('-created_at')
        else:
            queryset = queryset.order_by('-id')

        return queryset


class ProductDetailView(generics.RetrieveAPIView):
    queryset = Product.objects.filter(status='active')
    serializer_class = ProductSerializer
    permission_classes = [permissions.AllowAny]

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        if request.user.is_authenticated:
            track_event('view', request.user.id, instance.id)
        return super().retrieve(request, *args, **kwargs)


class ProductSearchView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        query = request.query_params.get('q', '')
        min_price = request.query_params.get('min_price')
        max_price = request.query_params.get('max_price')
        category = request.query_params.get('category')

        if not query:
            return Response({'error': 'Введите поисковый запрос'}, status=400)

        product_ids = search_products(query, min_price, max_price, category)

        if not product_ids:
            return Response([])

        from django.db.models import Case, When, IntegerField
        preserved_order = Case(
            *[When(id=pk, then=pos) for pos, pk in enumerate(product_ids)],
            output_field=IntegerField()
        )
        products = Product.objects.filter(id__in=product_ids).order_by(preserved_order)
        serializer = ProductSerializer(products, many=True)
        return Response(serializer.data)


class ProductCreateView(generics.CreateAPIView):
    serializer_class = ProductCreateSerializer
    permission_classes = [IsSeller]

    def perform_create(self, serializer):
        product = serializer.save()
        index_product(product)


class SellerProductListView(generics.ListAPIView):
    serializer_class = ProductSerializer
    permission_classes = [IsSeller]

    def get_queryset(self):
        return Product.objects.filter(seller=self.request.user)


class SellerProductUpdateView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = ProductCreateSerializer
    permission_classes = [IsSeller]

    def get_queryset(self):
        return Product.objects.filter(seller=self.request.user)

    def perform_update(self, serializer):
        product = serializer.save()
        index_product(product)

    def perform_destroy(self, instance):
        delete_product(instance.id)
        instance.delete()


class RecommendationsView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        try:
            products = list(Product.objects.filter(status='active').order_by('?')[:100])
            serializer = ProductSerializer(products, many=True, context={'request': request})
            return Response(serializer.data)
        except Exception as e:
            logger.error(f'Recommendations error: {e}')
            return Response([])

class ReviewListCreateView(generics.ListCreateAPIView):
    def get_serializer_class(self):
        if self.request.method == 'POST':
            return ReviewCreateSerializer
        return ReviewSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [permissions.IsAuthenticated()]
        return [permissions.AllowAny()]

    def get_queryset(self):
        return Review.objects.filter(product_id=self.kwargs['pk'])

    def perform_create(self, serializer):
        from apps.orders.models import Order
        has_purchased = Order.objects.filter(
            buyer=self.request.user,
            items__product_id=self.kwargs['pk']
        ).exists()
        if not has_purchased:
            from rest_framework.exceptions import PermissionDenied
            raise PermissionDenied('Вы можете оставить отзыв только на купленный товар')
        serializer.save(
            user=self.request.user,
            product_id=self.kwargs['pk']
        )