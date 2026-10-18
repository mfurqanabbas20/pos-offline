from django.conf import settings
from rest_framework import serializers

from .models import Batch, Category, Product


class CategorySerializer(serializers.ModelSerializer):
    product_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ['id', 'name', 'product_count']


class ProductSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    stock = serializers.IntegerField(read_only=True)
    sellable_stock = serializers.IntegerField(read_only=True)
    is_low_stock = serializers.SerializerMethodField()

    class Meta:
        model = Product
        fields = [
            'id', 'name', 'sku', 'category', 'category_name', 'purchase_price', 'selling_price',
            'reorder_level', 'is_active', 'stock', 'sellable_stock', 'is_low_stock',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['created_at', 'updated_at']

    def get_is_low_stock(self, obj) -> bool:
        sellable = getattr(obj, 'sellable_stock', None)
        return sellable is not None and obj.is_active and sellable <= obj.reorder_level

    def validate(self, attrs):
        purchase = attrs.get('purchase_price', getattr(self.instance, 'purchase_price', None))
        selling = attrs.get('selling_price', getattr(self.instance, 'selling_price', None))
        if purchase is not None and selling is not None and selling < purchase:
            raise serializers.ValidationError({'selling_price': 'Selling price cannot be below purchase price.'})
        return attrs


class BatchSerializer(serializers.ModelSerializer):
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_sku = serializers.CharField(source='product.sku', read_only=True)
    selling_price = serializers.DecimalField(
        source='product.selling_price', max_digits=12, decimal_places=2, read_only=True
    )
    reorder_level = serializers.IntegerField(source='product.reorder_level', read_only=True)
    days_to_expiry = serializers.IntegerField(read_only=True)
    expiry_status = serializers.SerializerMethodField()
    product_sellable_stock = serializers.IntegerField(read_only=True, required=False)

    class Meta:
        model = Batch
        fields = [
            'id', 'product', 'product_name', 'product_sku', 'batch_no', 'expiry_date', 'quantity',
            'purchase_price', 'selling_price', 'reorder_level', 'days_to_expiry', 'expiry_status',
            'product_sellable_stock', 'created_at',
        ]
        read_only_fields = ['created_at']
        validators = []  # replaced by the friendlier per-field check in validate()

    def validate(self, attrs):
        product = attrs.get('product', getattr(self.instance, 'product', None))
        batch_no = attrs.get('batch_no', getattr(self.instance, 'batch_no', None))
        duplicate = Batch.objects.filter(product=product, batch_no=batch_no)
        if self.instance:
            duplicate = duplicate.exclude(pk=self.instance.pk)
        if product and batch_no and duplicate.exists():
            raise serializers.ValidationError({'batch_no': 'This product already has a batch with this number.'})
        return attrs

    def get_expiry_status(self, obj) -> str:
        """'expired', 'expiring' (within EXPIRY_WARNING_DAYS) or 'ok'."""
        days = obj.days_to_expiry
        if days < 0:
            return 'expired'
        if days <= settings.EXPIRY_WARNING_DAYS:
            return 'expiring'
        return 'ok'
