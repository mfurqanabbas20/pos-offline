from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import BatchViewSet, CategoryViewSet, InventoryReportView, ProductViewSet

router = DefaultRouter()
router.register('categories', CategoryViewSet)
router.register('products', ProductViewSet)
router.register('batches', BatchViewSet, basename='batch')

urlpatterns = [
    path('inventory/', InventoryReportView.as_view(), name='inventory-report'),
    *router.urls,
]
