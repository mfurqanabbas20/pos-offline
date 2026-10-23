from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    BatchViewSet,
    CategoryViewSet,
    InventoryImportTemplateView,
    InventoryImportView,
    InventoryReportView,
    ProductViewSet,
)

router = DefaultRouter()
router.register('categories', CategoryViewSet)
router.register('products', ProductViewSet)
router.register('batches', BatchViewSet, basename='batch')

urlpatterns = [
    path('inventory/', InventoryReportView.as_view(), name='inventory-report'),
    path('inventory/import/', InventoryImportView.as_view(), name='inventory-import'),
    path('inventory/import/template/', InventoryImportTemplateView.as_view(), name='inventory-import-template'),
    *router.urls,
]
