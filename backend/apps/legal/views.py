from rest_framework import generics, permissions

from .models import LegalDocument
from .serializers import LegalDocumentListSerializer, LegalDocumentSerializer


class LegalDocumentListView(generics.ListAPIView):
    """Список опубликованных документов (для футера/индекса). Публичный (AllowAny):
    юр-документы по закону доступны гостю до регистрации/покупки."""
    serializer_class = LegalDocumentListSerializer
    permission_classes = [permissions.AllowAny]
    pagination_class = None  # документов мало (5), отдаём списком целиком

    def get_queryset(self):
        return LegalDocument.objects.filter(is_published=True)


class LegalDocumentDetailView(generics.RetrieveAPIView):
    """Один документ по slug. Публичный. Черновик (is_published=False) и
    неизвестный slug -> 404 (queryset фильтрует по is_published)."""
    serializer_class = LegalDocumentSerializer
    permission_classes = [permissions.AllowAny]
    lookup_field = 'slug'

    def get_queryset(self):
        return LegalDocument.objects.filter(is_published=True)
