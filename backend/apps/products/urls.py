from django.urls import path
from .models import Answer, Question, Review
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
    ModerationQueueView,
    ModerationApproveView,
    ModerationRejectView,
    ReportListCreateView,
    ReportResolveView,
    ReportDismissView,
    UGCModerationView,
    BrandStorefrontView,
    BrandReviewListCreateView,
    BrandFollowView,
)

urlpatterns = [
    path('categories/', CategoryListView.as_view(), name='category-list'),
    path('', ProductListView.as_view(), name='product-list'),
    path('facets/', CatalogFacetsView.as_view(), name='catalog-facets'),
    path('search/', ProductSearchView.as_view(), name='product-search'),
    path('autocomplete/', AutocompleteView.as_view(), name='product-autocomplete'),
    path('recommendations/', RecommendationsView.as_view(), name='recommendations'),
    # Ф20 (узел 1.21): витрина бренда. Литерал brand/ до <int:pk>/ - не
    # конфликтует. Профиль + отзывы о продавце + подписка (toggle/статус).
    path('brand/<int:pk>/', BrandStorefrontView.as_view(), name='brand-detail'),
    path('brand/<int:pk>/reviews/', BrandReviewListCreateView.as_view(), name='brand-reviews'),
    path('brand/<int:pk>/follow/', BrandFollowView.as_view(), name='brand-follow'),
    # Литерал reviews/my/ - до <int:pk>/ (Ф10, мои отзывы).
    path('reviews/my/', MyReviewsView.as_view(), name='my-reviews'),
    # Ф15 (узел 2.8): кабинет продавца - агрегация отзывов/вопросов и ответ на
    # отзыв. Префикс my/ (как seller-эндпоинты этого app); int-pk не ловит литералы.
    path('my/reviews/', SellerReviewListView.as_view(), name='seller-reviews'),
    path('my/questions/', SellerQuestionListView.as_view(), name='seller-questions'),
    path('reviews/<int:pk>/reply/', ReviewReplyView.as_view(), name='review-reply'),
    # Ф17 (узел 3.2): очередь модерации и действия (только админ). Литерал
    # moderation/ до <int:pk>/ - не конфликтует (moderation не int).
    path('moderation/', ModerationQueueView.as_view(), name='moderation-queue'),
    path('moderation/<int:pk>/approve/', ModerationApproveView.as_view(), name='moderation-approve'),
    path('moderation/<int:pk>/reject/', ModerationRejectView.as_view(), name='moderation-reject'),
    # Ф18 (узел 3.8): жалобы и модерация UGC. reports/ - один view (POST создание /
    # GET очередь админа); resolve/dismiss - обработка жалобы; hide/unhide -
    # проактивная модерация контента. Литералы до <int:pk>/ - не конфликтуют.
    path('reports/', ReportListCreateView.as_view(), name='reports'),
    path('reports/<int:pk>/resolve/', ReportResolveView.as_view(), name='report-resolve'),
    path('reports/<int:pk>/dismiss/', ReportDismissView.as_view(), name='report-dismiss'),
    path('reviews/<int:pk>/hide/', UGCModerationView.as_view(model=Review, hide=True), name='review-hide'),
    path('reviews/<int:pk>/unhide/', UGCModerationView.as_view(model=Review, hide=False), name='review-unhide'),
    path('questions/<int:pk>/hide/', UGCModerationView.as_view(model=Question, hide=True), name='question-hide'),
    path('questions/<int:pk>/unhide/', UGCModerationView.as_view(model=Question, hide=False), name='question-unhide'),
    path('answers/<int:pk>/hide/', UGCModerationView.as_view(model=Answer, hide=True), name='answer-hide'),
    path('answers/<int:pk>/unhide/', UGCModerationView.as_view(model=Answer, hide=False), name='answer-unhide'),
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