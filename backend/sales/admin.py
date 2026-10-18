from django.contrib import admin

from .models import Invoice, InvoiceItem, Return, ReturnItem


class ReadOnlyInline(admin.TabularInline):
    extra = 0
    can_delete = False

    def has_add_permission(self, request, obj=None):
        return False

    def has_change_permission(self, request, obj=None):
        return False


class InvoiceItemInline(ReadOnlyInline):
    model = InvoiceItem
    fields = ['product', 'batch', 'quantity', 'unit_price', 'unit_cost', 'line_total']


class ReturnItemInline(ReadOnlyInline):
    model = ReturnItem
    fields = ['invoice_item', 'quantity', 'refund_amount']


@admin.register(Invoice)
class InvoiceAdmin(admin.ModelAdmin):
    """Invoices are immutable in admin: sales and returns must go through the service layer."""

    list_display = ['number', 'date', 'customer_name', 'total', 'payment_method', 'status', 'created_by']
    list_filter = ['status', 'payment_method', 'date']
    search_fields = ['number', 'customer_name']
    date_hierarchy = 'date'
    inlines = [InvoiceItemInline]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Return)
class ReturnAdmin(admin.ModelAdmin):
    list_display = ['number', 'invoice', 'date', 'reason', 'refund_amount', 'created_by']
    search_fields = ['number', 'invoice__number', 'reason']
    date_hierarchy = 'date'
    inlines = [ReturnItemInline]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
