from rest_framework.permissions import BasePermission


class IsSeller(BasePermission):
    message = 'Доступ только для продавцов.'

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'seller'


class IsSellerOrAdmin(BasePermission):
    message = 'Доступ только для продавцов и администраторов.'

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['seller', 'admin']