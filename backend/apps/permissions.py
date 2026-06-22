from rest_framework.permissions import BasePermission


class IsSeller(BasePermission):
    message = 'Доступ только для продавцов.'

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'seller'


class IsSellerOrAdmin(BasePermission):
    message = 'Доступ только для продавцов и администраторов.'

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role in ['seller', 'admin']


class IsAdmin(BasePermission):
    """Только администратор площадки (Ф17, узел 3.2). Модерация - барьер качества:
    продавец не должен мочь одобрить/отклонить (ни свой, ни чужой товар), иначе
    барьер бессмыслен (план 9, статус-инъекция)."""
    message = 'Доступ только для администраторов.'

    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == 'admin'