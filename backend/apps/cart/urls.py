from django.urls import path
from .views import CartView, CartMergeView

urlpatterns = [
    path('', CartView.as_view(), name='cart'),
    path('merge/', CartMergeView.as_view(), name='cart-merge'),
]
