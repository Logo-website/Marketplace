from django.urls import path

from .views import LegalDocumentListView, LegalDocumentDetailView

urlpatterns = [
    path('documents/', LegalDocumentListView.as_view(), name='legal-document-list'),
    path('documents/<slug:slug>/', LegalDocumentDetailView.as_view(), name='legal-document-detail'),
]
