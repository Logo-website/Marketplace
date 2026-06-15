from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from .views import (
    RegisterRequestView, RegisterVerifyView,
    LoginRequestView, LoginVerifyView,
    ProfileView, LogoutView,
    PasswordResetRequestView, PasswordResetVerifyView
)

urlpatterns = [
    path('register/', RegisterRequestView.as_view(), name='register'),
    path('register/verify/', RegisterVerifyView.as_view(), name='register-verify'),
    path('login/', LoginRequestView.as_view(), name='login'),
    path('login/verify/', LoginVerifyView.as_view(), name='login-verify'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('profile/', ProfileView.as_view(), name='profile'),
    path('logout/', LogoutView.as_view(), name='logout'),
    path('password-reset/', PasswordResetRequestView.as_view(), name='password-reset'),
    path('password-reset/verify/', PasswordResetVerifyView.as_view(), name='password-reset-verify'),
]