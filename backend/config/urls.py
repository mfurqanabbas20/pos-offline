from django.conf import settings
from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from core.views import HealthView

admin.site.site_header = f'{settings.PHARMACY_NAME} administration'
admin.site.site_title = settings.PHARMACY_NAME

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/health/', HealthView.as_view(), name='health'),
    path('api/auth/', include('accounts.urls')),
    path('api/', include('inventory.urls')),
    path('api/', include('sales.urls')),
    path('api/', include('reports.urls')),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
]
