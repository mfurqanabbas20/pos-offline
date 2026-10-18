from datetime import timedelta

import django_filters
from django.conf import settings
from django.db.models import F
from django.utils import timezone

from .models import Batch, Product


class ProductFilter(django_filters.FilterSet):
    low_stock = django_filters.BooleanFilter(method='filter_low_stock')
    min_price = django_filters.NumberFilter(field_name='selling_price', lookup_expr='gte')
    max_price = django_filters.NumberFilter(field_name='selling_price', lookup_expr='lte')

    class Meta:
        model = Product
        fields = ['category', 'is_active']

    def filter_low_stock(self, queryset, name, value):
        condition = {'sellable_stock__lte': F('reorder_level')}
        return queryset.filter(**condition) if value else queryset.exclude(**condition)


class BatchFilter(django_filters.FilterSet):
    EXPIRY_CHOICES = [('expired', 'Expired'), ('expiring', 'Expiring soon'), ('ok', 'OK')]

    expiry_status = django_filters.ChoiceFilter(choices=EXPIRY_CHOICES, method='filter_expiry_status')
    expiry_before = django_filters.DateFilter(field_name='expiry_date', lookup_expr='lte')
    expiry_after = django_filters.DateFilter(field_name='expiry_date', lookup_expr='gte')
    in_stock = django_filters.BooleanFilter(method='filter_in_stock')
    category = django_filters.NumberFilter(field_name='product__category')

    class Meta:
        model = Batch
        fields = ['product']

    def filter_expiry_status(self, queryset, name, value):
        today = timezone.localdate()
        warn_until = today + timedelta(days=settings.EXPIRY_WARNING_DAYS)
        if value == 'expired':
            return queryset.filter(expiry_date__lt=today)
        if value == 'expiring':
            return queryset.filter(expiry_date__gte=today, expiry_date__lte=warn_until)
        return queryset.filter(expiry_date__gt=warn_until)

    def filter_in_stock(self, queryset, name, value):
        return queryset.filter(quantity__gt=0) if value else queryset.filter(quantity=0)
