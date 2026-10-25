from rest_framework import serializers

from .models import Invoice, InvoiceItem, Return, ReturnItem

# ---------- Read serializers ----------


class InvoiceItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    batch_no = serializers.CharField(source='batch.batch_no', read_only=True)
    expiry_date = serializers.DateField(source='batch.expiry_date', read_only=True)
    returned_quantity = serializers.IntegerField(read_only=True)
    returnable_quantity = serializers.IntegerField(read_only=True)

    class Meta:
        model = InvoiceItem
        fields = [
            'id', 'product', 'product_name', 'product_sku', 'batch', 'batch_no', 'expiry_date',
            'quantity', 'unit_price', 'unit_cost', 'line_total', 'returned_quantity', 'returnable_quantity',
            'sale_unit', 'pack_size',
        ]


class InvoiceListSerializer(serializers.ModelSerializer):
    created_by_name = serializers.SerializerMethodField()
    item_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Invoice
        fields = [
            'id', 'number', 'date', 'customer_name', 'subtotal', 'discount', 'total', 'payment_method',
            'amount_received', 'change_due', 'status', 'created_by', 'created_by_name', 'item_count',
        ]

    def get_created_by_name(self, obj) -> str:
        return obj.created_by.get_full_name() or obj.created_by.username


class ReturnSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = Return
        fields = ['id', 'number', 'date', 'reason', 'refund_amount']


class InvoiceDetailSerializer(InvoiceListSerializer):
    items = InvoiceItemSerializer(many=True, read_only=True)
    returns = ReturnSummarySerializer(many=True, read_only=True)

    class Meta(InvoiceListSerializer.Meta):
        fields = [*InvoiceListSerializer.Meta.fields, 'items', 'returns']


class ReturnItemSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='invoice_item.product.name', read_only=True)
    batch_no = serializers.CharField(source='invoice_item.batch.batch_no', read_only=True)
    unit_price = serializers.DecimalField(source='invoice_item.unit_price', max_digits=12, decimal_places=2,
                                          read_only=True)

    class Meta:
        model = ReturnItem
        fields = ['id', 'invoice_item', 'product_name', 'batch_no', 'quantity', 'unit_price', 'refund_amount']


class ReturnSerializer(serializers.ModelSerializer):
    invoice_number = serializers.CharField(source='invoice.number', read_only=True)
    created_by_name = serializers.SerializerMethodField()
    items = ReturnItemSerializer(many=True, read_only=True)

    class Meta:
        model = Return
        fields = [
            'id', 'number', 'invoice', 'invoice_number', 'date', 'reason', 'refund_amount',
            'created_by', 'created_by_name', 'items',
        ]

    def get_created_by_name(self, obj) -> str:
        return obj.created_by.get_full_name() or obj.created_by.username


# ---------- Write (command) serializers ----------


class SaleLineInputSerializer(serializers.Serializer):
    product = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1, max_value=100000)
    unit = serializers.ChoiceField(choices=['piece', 'pack'], default='piece')


class SaleInputSerializer(serializers.Serializer):
    items = SaleLineInputSerializer(many=True, allow_empty=False)
    discount = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, default=0)
    # Optional: discount as a percentage of the subtotal. When given, it replaces `discount`.
    discount_percent = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100,
                                                required=False, allow_null=True)
    payment_method = serializers.ChoiceField(choices=Invoice.PaymentMethod.choices)
    amount_received = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False,
                                               allow_null=True)
    customer_name = serializers.CharField(max_length=150, required=False, allow_blank=True, default='')


class ReturnLineInputSerializer(serializers.Serializer):
    invoice_item = serializers.IntegerField(min_value=1)
    quantity = serializers.IntegerField(min_value=1)


class ReturnInputSerializer(serializers.Serializer):
    invoice = serializers.IntegerField(min_value=1)
    items = ReturnLineInputSerializer(many=True, allow_empty=False)
    reason = serializers.CharField(max_length=255)
