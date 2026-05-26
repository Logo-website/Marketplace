from django.urls import path
from .views import (
    CategoryListView,
    ProductListView,
    ProductDetailView,
    ProductCreateView,
    ProductSearchView,
    SellerProductListView,
    SellerProductUpdateView,
    RecommendationsView,
)
from .analytics import SellerAnalyticsView

urlpatterns = [
    path('categories/', CategoryListView.as_view(), name='category-list'),
    path('', ProductListView.as_view(), name='product-list'),
    path('search/', ProductSearchView.as_view(), name='product-search'),
    path('recommendations/', RecommendationsView.as_view(), name='recommendations'),
    path('<int:pk>/', ProductDetailView.as_view(), name='product-detail'),
    path('create/', ProductCreateView.as_view(), name='product-create'),
    path('my/', SellerProductListView.as_view(), name='seller-products'),
    path('my/<int:pk>/', SellerProductUpdateView.as_view(), name='seller-product-detail'),
    path('analytics/', SellerAnalyticsView.as_view(), name='seller-analytics'),
]