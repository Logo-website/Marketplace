from django.urls import path
from .views import (
    CategoryListView,
    ProductListView,
    ProductDetailView,
    SizeChartView,
    ProductCreateView,
    ProductSearchView,
    AutocompleteView,
    CatalogFacetsView,
    SellerProductListView,
    SellerProductUpdateView,
    SellerProductVisibilityView,
    RecommendationsView,
    MyReviewsView,
)
from .analytics import SellerAnalyticsView
from .dashboard import SellerDashboardView
from .images import ProductImagesView, ProductImageDetailView
from .views import (
    ReviewListCreateView,
    QuestionListCreateView,
    AnswerCreateView,
    AnswerHelpfulToggleView,
    SellerReviewListView,
    ReviewReplyView,
    SellerQuestionListView,
)

urlpatterns = [
    path('categories/', CategoryListView.as_view(), name='category-list'),
    path('', ProductListView.as_view(), name='product-list'),
    path('facets/', CatalogFacetsView.as_view(), name='catalog-facets'),
    path('search/', ProductSearchView.as_view(), name='product-search'),
    path('autocomplete/', AutocompleteView.as_view(), name='product-autocomplete'),
    path('recommendations/', RecommendationsView.as_view(), name='recommendations'),
    # Литерал reviews/my/ - до <int:pk>/ (Ф10, мои отзывы).
    path('reviews/my/', MyReviewsView.as_view(), name='my-reviews'),
    # Ф15 (узел 2.8): кабинет продавца - агрегация отзывов/вопросов и ответ на
    # отзыв. Префикс my/ (как seller-эндпоинты этого app); int-pk не ловит литералы.
    path('my/reviews/', SellerReviewListView.as_view(), name='seller-reviews'),
    path('my/questions/', SellerQuestionListView.as_view(), name='seller-questions'),
    path('reviews/<int:pk>/reply/', ReviewReplyView.as_view(), name='review-reply'),
    path('<int:pk>/', ProductDetailView.as_view(), name='product-detail'),
    path('create/', ProductCreateView.as_view(), name='product-create'),
    path('my/', SellerProductListView.as_view(), name='seller-products'),
    # Фото товара (Ф12): литералы images/ до <int:pk>/ детали - не конфликтуют.
    path('my/<int:pk>/images/', ProductImagesView.as_view(), name='product-images'),
    path('my/<int:pk>/images/<int:image_id>/', ProductImageDetailView.as_view(), name='product-image-detail'),
    # Литерал visibility/ до <int:pk>/ детали - не конфликтует (Ф13, скрыть/показать).
    path('my/<int:pk>/visibility/', SellerProductVisibilityView.as_view(), name='seller-product-visibility'),
    path('my/<int:pk>/', SellerProductUpdateView.as_view(), name='seller-product-detail'),
    path('analytics/', SellerAnalyticsView.as_view(), name='seller-analytics'),
    # Дашборд продавца (Ф16, узел 2.1): денежная сводка + график + панель действий.
    path('dashboard/', SellerDashboardView.as_view(), name='seller-dashboard'),
    path('<int:pk>/reviews/', ReviewListCreateView.as_view(), name='product-reviews'),
    path('<int:pk>/size-chart/', SizeChartView.as_view(), name='product-size-chart'),
    # Q&A (Ф6). literal-префикс answers/ не конфликтует с <int:pk>/.
    path('<int:pk>/questions/', QuestionListCreateView.as_view(), name='product-questions'),
    path('<int:pk>/questions/<int:qid>/answers/', AnswerCreateView.as_view(), name='question-answers'),
    path('answers/<int:aid>/helpful/', AnswerHelpfulToggleView.as_view(), name='answer-helpful'),
]