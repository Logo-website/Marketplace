from rest_framework import serializers

from .models import LegalDocument, Receipt


class LegalDocumentListSerializer(serializers.ModelSerializer):
    """Краткий вид для индекса/футера: без тела документа."""
    class Meta:
        model = LegalDocument
        fields = ['slug', 'title', 'version', 'effective_date']


class LegalDocumentSerializer(serializers.ModelSerializer):
    """Полный вид документа. Только публичные поля - служебное (is_published)
    наружу не отдаём (§8)."""
    class Meta:
        model = LegalDocument
        fields = ['slug', 'title', 'body', 'version', 'effective_date', 'updated_at']


class ReceiptSerializer(serializers.ModelSerializer):
    """Чек-эмуляция в составе заказа владельца (§4.5). is_emulated - честная
    пометка для UI «не фискальный документ»."""
    class Meta:
        model = Receipt
        fields = ['fn_number', 'fd_number', 'fiscal_sign', 'total', 'is_emulated', 'created_at']
