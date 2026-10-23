from django.urls import path

from .views import DashboardView, MonthlyReportDownloadView

urlpatterns = [
    path('dashboard/', DashboardView.as_view(), name='dashboard'),
    path('reports/monthly/', MonthlyReportDownloadView.as_view(), name='monthly-report'),
]
