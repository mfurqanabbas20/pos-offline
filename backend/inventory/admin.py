from django.contrib import admin

from .models import Batch, Category, Product


class BatchInline(admin.TabularInline):
    model = Batch
    extra = 0
    fields = ['batch_no', 'expiry_date', 'quantity', 'purchase_price']


@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    search_fields = ['name']


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ['name', 'sku', 'category', 'purchase_price', 'selling_price', 'reorder_level', 'is_active']
    list_filter = ['category', 'is_active']
    search_fields = ['name', 'sku']
    list_editable = ['is_active']
    inlines = [BatchInline]


@admin.register(Batch)
class BatchAdmin(admin.ModelAdmin):
    list_display = ['product', 'batch_no', 'expiry_date', 'quantity', 'purchase_price']
    list_filter = ['expiry_date', 'product__category']
    search_fields = ['batch_no', 'product__name', 'product__sku']
    autocomplete_fields = ['product']
    date_hierarchy = 'expiry_date'
