from django.db.models import Count, Prefetch, Sum, Value
from django.db.models.functions import Coalesce
from drf_spectacular.utils import extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from . import services
from .filters import InvoiceFilter, ReturnFilter
from .models import Invoice, InvoiceItem, Return, ReturnItem
from .serializers import (
    InvoiceDetailSerializer,
    InvoiceListSerializer,
    ReturnInputSerializer,
    ReturnSerializer,
    SaleInputSerializer,
)


def invoice_detail_queryset():
    items = (
        InvoiceItem.objects.select_related('product', 'batch')
        .annotate(returned_qty_annotated=Coalesce(Sum('return_items__quantity'), Value(0)))
    )
    return (
        Invoice.objects.select_related('created_by')
        .annotate(item_count=Count('items', distinct=True))
        .prefetch_related(Prefetch('items', queryset=items), 'returns')
    )


class SaleCreateView(APIView):
    """Record a sale: validates stock, deducts batches FEFO and returns the new invoice."""

    @extend_schema(request=SaleInputSerializer, responses={201: InvoiceDetailSerializer})
    def post(self, request):
        payload = SaleInputSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        invoice = services.create_sale(
            user=request.user,
            lines=[services.SaleLine(product_id=i['product'], quantity=i['quantity'], unit=i['unit']) for i in data['items']],
            payment_method=data['payment_method'],
            amount_received=data.get('amount_received'),
            discount=data['discount'],
            discount_percent=data.get('discount_percent'),
            customer_name=data.get('customer_name', ''),
        )
        invoice = invoice_detail_queryset().get(pk=invoice.pk)
        return Response(InvoiceDetailSerializer(invoice).data, status=status.HTTP_201_CREATED)


class InvoiceViewSet(viewsets.ReadOnlyModelViewSet):
    filterset_class = InvoiceFilter
    search_fields = ['number', 'customer_name']
    ordering_fields = ['date', 'total', 'number']
    ordering = ['-date', '-id']

    def get_queryset(self):
        if self.action == 'retrieve':
            return invoice_detail_queryset()
        return Invoice.objects.select_related('created_by').annotate(item_count=Count('items'))

    def get_serializer_class(self):
        return InvoiceDetailSerializer if self.action == 'retrieve' else InvoiceListSerializer


class ReturnViewSet(mixins.CreateModelMixin, viewsets.ReadOnlyModelViewSet):
    serializer_class = ReturnSerializer
    filterset_class = ReturnFilter
    search_fields = ['number', 'invoice__number', 'reason', 'invoice__customer_name']
    ordering_fields = ['date', 'refund_amount', 'number']
    ordering = ['-date', '-id']

    def get_queryset(self):
        items = ReturnItem.objects.select_related('invoice_item__product', 'invoice_item__batch')
        return (
            Return.objects.select_related('invoice', 'created_by')
            .prefetch_related(Prefetch('items', queryset=items))
        )

    @extend_schema(request=ReturnInputSerializer, responses={201: ReturnSerializer})
    def create(self, request, *args, **kwargs):
        payload = ReturnInputSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        sales_return = services.create_return(
            user=request.user,
            invoice_id=data['invoice'],
            lines=[services.ReturnLine(invoice_item_id=i['invoice_item'], quantity=i['quantity'])
                   for i in data['items']],
            reason=data['reason'],
        )
        sales_return = self.get_queryset().get(pk=sales_return.pk)
        return Response(ReturnSerializer(sales_return).data, status=status.HTTP_201_CREATED)
