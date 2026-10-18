from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import InvoiceViewSet, ReturnViewSet, SaleCreateView

router = DefaultRouter()
router.register('invoices', InvoiceViewSet, basename='invoice')
router.register('returns', ReturnViewSet, basename='return')

urlpatterns = [
    path('sales/', SaleCreateView.as_view(), name='sale-create'),
    *router.urls,
]
