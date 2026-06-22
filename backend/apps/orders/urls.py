from django.urls import path
from .views import (
    OrderListCreateView, OrderDetailView, OrderFromCartView,
    OrderStatusUpdateView, OrderCancelView,
    SellerOrderListView, SellerOrderDetailView,
)

urlpatterns = [
    path('', OrderListCreateView.as_view(), name='order-list'),
    # Литеральный seller/ - ДО <int:pk>/, чтобы роут детали покупателя его не
    # затенял (план 4.1, задача 3).
    path('seller/', SellerOrderListView.as_view(), name='seller-order-list'),
    path('seller/<int:pk>/', SellerOrderDetailView.as_view(), name='seller-order-detail'),
    path('<int:pk>/', OrderDetailView.as_view(), name='order-detail'),
    path('from-cart/', OrderFromCartView.as_view(), name='order-from-cart'),
    path('<int:pk>/status/', OrderStatusUpdateView.as_view(), name='order-status'),
    path('<int:pk>/cancel/', OrderCancelView.as_view(), name='order-cancel'),
]