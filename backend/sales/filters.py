import django_filters

from .models import Invoice, Return


class InvoiceFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name='date', lookup_expr='date__gte')
    date_to = django_filters.DateFilter(field_name='date', lookup_expr='date__lte')

    class Meta:
        model = Invoice
        fields = ['status', 'payment_method', 'created_by']


class ReturnFilter(django_filters.FilterSet):
    date_from = django_filters.DateFilter(field_name='date', lookup_expr='date__gte')
    date_to = django_filters.DateFilter(field_name='date', lookup_expr='date__lte')

    class Meta:
        model = Return
        fields = ['invoice']
