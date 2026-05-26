from django.urls import path
from .views import OrderListCreateView, OrderDetailView, OrderFromCartView, OrderStatusUpdateView

urlpatterns = [
    path('', OrderListCreateView.as_view(), name='order-list'),
    path('<int:pk>/', OrderDetailView.as_view(), name='order-detail'),
    path('from-cart/', OrderFromCartView.as_view(), name='order-from-cart'),
    path('<int:pk>/status/', OrderStatusUpdateView.as_view(), name='order-status'),
]