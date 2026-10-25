from django.conf import settings
from django.db.models import Count, OuterRef, ProtectedError, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from django.http import HttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers, status, viewsets
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response
from rest_framework.views import APIView

from core.exceptions import error_response

from . import importer
from .filters import BatchFilter, ProductFilter
from .models import Batch, Category, Product
from .receiving import ReceiveStockSerializer, receive_stock
from .serializers import BatchSerializer, CategorySerializer, ProductSerializer


class ProtectedDeleteMixin:
    """Return a clean 409 instead of a 500 when a referenced row is deleted."""

    protected_message = 'This record is in use and cannot be deleted.'

    def destroy(self, request, *args, **kwargs):
        try:
            return super().destroy(request, *args, **kwargs)
        except ProtectedError:
            return error_response(self.protected_message, code='protected', http_status=status.HTTP_409_CONFLICT)


class CategoryViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    queryset = Category.objects.annotate(product_count=Count('products'))
    serializer_class = CategorySerializer
    search_fields = ['name']
    ordering_fields = ['name', 'product_count']
    protected_message = 'This category still has products. Move or delete them first.'


class ProductViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    queryset = Product.objects.select_related('category').with_stock()
    serializer_class = ProductSerializer
    filterset_class = ProductFilter
    search_fields = ['name', 'sku', 'category__name']
    ordering_fields = ['name', 'sku', 'selling_price', 'purchase_price', 'stock', 'sellable_stock', 'created_at']
    ordering = ['name']
    protected_message = 'This product has batches or sales history. Mark it inactive instead.'

    def get_queryset(self):
        queryset = super().get_queryset()
        # Exact barcode match, used by scanners on the POS screen.
        barcode = self.request.query_params.get('barcode')
        if barcode:
            queryset = queryset.filter(sku__iexact=barcode.strip())
        return queryset


class BatchViewSet(ProtectedDeleteMixin, viewsets.ModelViewSet):
    serializer_class = BatchSerializer
    filterset_class = BatchFilter
    search_fields = ['batch_no', 'product__name', 'product__sku']
    ordering_fields = ['expiry_date', 'quantity', 'batch_no', 'product__name', 'purchase_price', 'created_at']
    ordering = ['expiry_date', 'id']
    protected_message = 'This batch has been sold from and cannot be deleted. Set its quantity to 0 instead.'

    def get_queryset(self):
        # Product-level sellable stock lets each batch row show the product's low-stock state.
        product_stock = (
            Batch.objects.filter(product=OuterRef('product'), expiry_date__gte=timezone.localdate())
            .values('product').annotate(total=Sum('quantity')).values('total')
        )
        return (
            Batch.objects.select_related('product', 'product__category')
            .annotate(product_sellable_stock=Coalesce(Subquery(product_stock), Value(0)))
        )


class InventoryImportView(APIView):
    """Bulk import products and stock batches from an Excel/CSV file.

    POST multipart `file` with `commit=false` (default) to preview, `commit=true` to import.
    Nothing is written unless every row is valid.
    """

    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(
        request={'multipart/form-data': {'type': 'object', 'properties': {
            'file': {'type': 'string', 'format': 'binary'}, 'commit': {'type': 'boolean'}}}},
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request):
        uploaded = request.FILES.get('file')
        if uploaded is None:
            return error_response('Choose an Excel (.xlsx) or CSV file to upload.', code='validation_error')
        if uploaded.size > 5 * 1024 * 1024:
            return error_response('The file is larger than 5 MB.', code='validation_error')
        commit = str(request.data.get('commit', 'false')).lower() in ('1', 'true', 'yes')

        try:
            results, summary = importer.analyse(uploaded)
        except importer.ImportFileError as exc:
            return error_response(str(exc), code='invalid_file')

        rows = [r.as_dict() for r in results]
        if commit:
            if summary['error_rows']:
                return error_response(
                    f'{summary["error_rows"]} row(s) have errors. Fix them and upload again; nothing was imported.',
                    code='validation_error',
                )
            importer.apply(results)
        return Response({'committed': commit, 'summary': summary, 'rows': rows})


class InventoryImportTemplateView(APIView):
    @extend_schema(responses={(200, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'): OpenApiTypes.BINARY})
    def get(self, request):
        response = HttpResponse(
            importer.build_template(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = 'attachment; filename="inventory-import-template.xlsx"'
        return response


class InventoryReportView(APIView):
    """Stock alerts: low-stock products, batches expiring within N days, and expired batches with stock.

    Each list is capped at ``limit`` rows (most urgent first) with its full ``*_count`` alongside; the
    complete lists are paginated at /products/?low_stock=true and /batches/?expiry_status=expiring|expired.
    """

    @extend_schema(
        parameters=[
            OpenApiParameter('days', OpenApiTypes.INT, description='Expiry window in days (default 90).'),
            OpenApiParameter('limit', OpenApiTypes.INT, description='Max rows per list (default 20, max 200).'),
        ],
        responses=inline_serializer(
            'InventoryReport',
            fields={
                'days': serializers.IntegerField(),
                'limit': serializers.IntegerField(),
                'low_stock': ProductSerializer(many=True),
                'expiring': BatchSerializer(many=True),
                'expired': BatchSerializer(many=True),
                'low_stock_count': serializers.IntegerField(),
                'expiring_count': serializers.IntegerField(),
                'expired_count': serializers.IntegerField(),
            },
        ),
    )
    def get(self, request):
        try:
            days = int(request.query_params.get('days', settings.EXPIRY_WARNING_DAYS))
            if days < 0:
                raise ValueError
        except ValueError:
            return error_response('days must be a non-negative integer.', code='validation_error')
        try:
            limit = min(int(request.query_params.get('limit', 20)), 200)
            if limit < 1:
                raise ValueError
        except ValueError:
            return error_response('limit must be a whole number between 1 and 200.', code='validation_error')

        batches = Batch.objects.select_related('product').in_stock()
        low_stock = Product.objects.select_related('category').low_stock().order_by('sellable_stock', 'name', 'id')
        expiring = batches.expiring_within(days).fefo()
        expired = batches.expired().fefo()
        return Response({
            'days': days,
            'limit': limit,
            'low_stock': ProductSerializer(low_stock[:limit], many=True).data,
            'expiring': BatchSerializer(expiring[:limit], many=True).data,
            'expired': BatchSerializer(expired[:limit], many=True).data,
            'low_stock_count': low_stock.count(),
            'expiring_count': expiring.count(),
            'expired_count': expired.count(),
        })


class ReceiveStockView(APIView):
    """One-step delivery: choose (or create) a medicine and add its stock, atomically."""

    @extend_schema(
        request=ReceiveStockSerializer,
        responses=inline_serializer('ReceiveStockResult', fields={
            'created_product': serializers.BooleanField(),
            'product': ProductSerializer(),
            'batch': BatchSerializer(),
        }),
    )
    def post(self, request):
        payload = ReceiveStockSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        product, batch, created = receive_stock(payload.validated_data)
        product = Product.objects.select_related('category').with_stock().get(pk=product.pk)
        return Response(
            {'created_product': created, 'product': ProductSerializer(product).data, 'batch': BatchSerializer(batch).data},
            status=status.HTTP_201_CREATED,
        )
