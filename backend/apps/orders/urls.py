from django.urls import path
from .views import (
    OrderListCreateView, OrderDetailView, OrderFromCartView,
    OrderStatusUpdateView, OrderCancelView,
    SellerOrderListView, SellerOrderDetailView,
    ReturnListCreateView, ReturnDetailView, ReturnDisputeView,
    SellerReturnListView, SellerReturnUpdateView,
)

urlpatterns = [
    path('', OrderListCreateView.as_view(), name='order-list'),
    # Литеральные префиксы (seller/, returns/) - ДО <int:pk>/, чтобы роут детали
    # покупателя их не затенял (план 4.1, задача 3).
    path('seller/', SellerOrderListView.as_view(), name='seller-order-list'),
    path('seller/<int:pk>/', SellerOrderDetailView.as_view(), name='seller-order-detail'),
    # Возвраты (Ф23). seller/returns/ - ДО returns/<int:pk>/.
    path('returns/', ReturnListCreateView.as_view(), name='return-list'),
    path('seller/returns/', SellerReturnListView.as_view(), name='seller-return-list'),
    path('seller/returns/<int:pk>/', SellerReturnUpdateView.as_view(), name='seller-return-update'),
    path('returns/<int:pk>/', ReturnDetailView.as_view(), name='return-detail'),
    path('returns/<int:pk>/dispute/', ReturnDisputeView.as_view(), name='return-dispute'),
    path('<int:pk>/', OrderDetailView.as_view(), name='order-detail'),
    path('from-cart/', OrderFromCartView.as_view(), name='order-from-cart'),
    path('<int:pk>/status/', OrderStatusUpdateView.as_view(), name='order-status'),
    path('<int:pk>/cancel/', OrderCancelView.as_view(), name='order-cancel'),
]