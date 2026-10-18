import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import Count, DecimalField, ExpressionWrapper, F, Sum, Value
from django.db.models.functions import Coalesce, TruncDate
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from core.exceptions import error_response
from inventory.models import Batch, Product
from sales.models import Invoice, InvoiceItem, Return, ReturnItem

ZERO = Decimal('0.00')
DECIMAL = DecimalField(max_digits=14, decimal_places=2)


def _money(value):
    return str(Decimal(value or 0).quantize(Decimal('0.01')))


def _sum(field):
    return Coalesce(Sum(field, output_field=DECIMAL), Value(ZERO), output_field=DECIMAL)


def _profit_expr(prefix=''):
    """(unit_price - unit_cost) * quantity, optionally through a relation prefix for the price fields."""
    return ExpressionWrapper(
        (F(f'{prefix}unit_price') - F(f'{prefix}unit_cost')) * F('quantity'), output_field=DECIMAL
    )


def month_bounds(month_str):
    """Return (first_day, aware start, aware end-exclusive) for 'YYYY-MM', or current month when blank."""
    if month_str:
        first = datetime.strptime(month_str, '%Y-%m').date()
    else:
        first = timezone.localdate().replace(day=1)
    days_in_month = calendar.monthrange(first.year, first.month)[1]
    next_first = first + timedelta(days=days_in_month)
    tz = timezone.get_current_timezone()
    start = timezone.make_aware(datetime.combine(first, datetime.min.time()), tz)
    end = timezone.make_aware(datetime.combine(next_first, datetime.min.time()), tz)
    return first, days_in_month, start, end


class DashboardView(APIView):
    @extend_schema(
        parameters=[
            OpenApiParameter('month', OpenApiTypes.STR, description='Month as YYYY-MM (defaults to current month).'),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        try:
            first, days_in_month, start, end = month_bounds(request.query_params.get('month'))
        except ValueError:
            return error_response('month must be in YYYY-MM format.', code='validation_error')

        invoices = Invoice.objects.filter(date__gte=start, date__lt=end)
        returns = Return.objects.filter(date__gte=start, date__lt=end)
        sold_items = InvoiceItem.objects.filter(invoice__date__gte=start, invoice__date__lt=end)
        returned_items = ReturnItem.objects.filter(return_obj__date__gte=start, return_obj__date__lt=end)

        sales_totals = invoices.aggregate(total=_sum('total'), count=Count('id'))
        total_returns = returns.aggregate(total=_sum('refund_amount'))['total']
        gross_profit = sold_items.aggregate(total=_sum(_profit_expr()))['total']
        returned_profit = returned_items.aggregate(total=_sum(_profit_expr('invoice_item__')))['total']

        # Daily series: sales and profit are netted against returns booked on the same day.
        daily = {first + timedelta(days=i): {'sales': ZERO, 'returns': ZERO, 'profit': ZERO}
                 for i in range(days_in_month)}

        def add(rows, key):
            for row in rows:
                if row['day'] in daily:
                    daily[row['day']][key] += row['value'] or ZERO

        add(invoices.annotate(day=TruncDate('date')).values('day').annotate(value=_sum('total')), 'sales')
        add(returns.annotate(day=TruncDate('date')).values('day').annotate(value=_sum('refund_amount')), 'returns')
        add(sold_items.annotate(day=TruncDate('invoice__date')).values('day')
            .annotate(value=_sum(_profit_expr())), 'profit')
        for row in (returned_items.annotate(day=TruncDate('return_obj__date')).values('day')
                    .annotate(value=_sum(_profit_expr('invoice_item__')))):
            if row['day'] in daily:
                daily[row['day']]['profit'] -= row['value'] or ZERO

        daily_series = [
            {
                'date': day.isoformat(),
                'sales': _money(values['sales']),
                'returns': _money(values['returns']),
                'net_sales': _money(values['sales'] - values['returns']),
                'profit': _money(values['profit']),
            }
            for day, values in sorted(daily.items())
        ]

        top_products = [
            {
                'product_id': row['product_id'],
                'name': row['product__name'],
                'sku': row['product__sku'],
                'quantity': row['quantity'],
                'revenue': _money(row['revenue']),
            }
            for row in sold_items.values('product_id', 'product__name', 'product__sku')
            .annotate(quantity=Sum('quantity'), revenue=_sum('line_total'))
            .order_by('-revenue', '-quantity')[:5]
        ]

        today = timezone.localdate()
        stocked_batches = Batch.objects.in_stock()
        return Response({
            'month': first.strftime('%Y-%m'),
            'total_sales': _money(sales_totals['total']),
            'total_returns': _money(total_returns),
            'net_revenue': _money(sales_totals['total'] - total_returns),
            'total_profit': _money(gross_profit - returned_profit),
            'invoice_count': sales_totals['count'],
            'daily': daily_series,
            'top_products': top_products,
            'low_stock_count': Product.objects.low_stock().count(),
            'expiring_count': stocked_batches.expiring_within(settings.EXPIRY_WARNING_DAYS, today).count(),
            'expired_count': stocked_batches.expired(today).count(),
            'expiry_warning_days': settings.EXPIRY_WARNING_DAYS,
        })
