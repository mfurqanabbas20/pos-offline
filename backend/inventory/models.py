from datetime import timedelta
from decimal import Decimal

from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

ZERO = Decimal('0.00')
MONEY = dict(max_digits=12, decimal_places=2, validators=[MinValueValidator(ZERO)])


class Category(models.Model):
    name = models.CharField(max_length=100, unique=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'categories'

    def __str__(self):
        return self.name


class ProductQuerySet(models.QuerySet):
    def with_stock(self):
        """Annotate total stock and sellable (non-expired) stock, both summed over batches."""
        today = timezone.localdate()
        return self.annotate(
            stock=Coalesce(Sum('batches__quantity'), Value(0)),
            sellable_stock=Coalesce(
                Sum('batches__quantity', filter=Q(batches__expiry_date__gte=today)), Value(0)
            ),
        )

    def low_stock(self):
        return self.with_stock().filter(is_active=True, sellable_stock__lte=models.F('reorder_level'))


class Product(models.Model):
    name = models.CharField(max_length=200)
    sku = models.CharField('SKU / barcode', max_length=64, unique=True)
    category = models.ForeignKey(Category, on_delete=models.PROTECT, related_name='products')
    purchase_price = models.DecimalField(**MONEY, help_text='Default cost; each batch records its own cost.')
    selling_price = models.DecimalField(**MONEY)
    reorder_level = models.PositiveIntegerField(default=10)
    is_active = models.BooleanField(default=True)
    # Stock and prices are per piece (tablet/capsule). A box is just a bundle of pieces with its own price.
    pieces_per_pack = models.PositiveIntegerField(
        default=1, validators=[MinValueValidator(1)], help_text='Pieces in one box/strip. 1 = sold only as a whole unit.'
    )
    pack_price = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True, validators=[MinValueValidator(ZERO)],
        help_text='Price of a full box. Blank = pieces_per_pack x selling_price.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = ProductQuerySet.as_manager()

    class Meta:
        ordering = ['name']
        indexes = [models.Index(fields=['name'])]

    def __str__(self):
        return f'{self.name} ({self.sku})'

    @property
    def sells_in_packs(self):
        return self.pieces_per_pack > 1

    @property
    def effective_pack_price(self):
        if self.pack_price is not None:
            return self.pack_price
        return (self.selling_price * self.pieces_per_pack).quantize(Decimal('0.01'))


class BatchQuerySet(models.QuerySet):
    def in_stock(self):
        return self.filter(quantity__gt=0)

    def expired(self, today=None):
        return self.filter(expiry_date__lt=today or timezone.localdate())

    def sellable(self, today=None):
        return self.in_stock().filter(expiry_date__gte=today or timezone.localdate())

    def expiring_within(self, days, today=None):
        today = today or timezone.localdate()
        return self.filter(expiry_date__gte=today, expiry_date__lte=today + timedelta(days=days))

    def fefo(self):
        """First-expiry-first-out ordering; ties broken by creation order."""
        return self.order_by('expiry_date', 'id')


class Batch(models.Model):
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='batches')
    batch_no = models.CharField(max_length=64)
    expiry_date = models.DateField()
    quantity = models.PositiveIntegerField(default=0)
    purchase_price = models.DecimalField(**MONEY)
    created_at = models.DateTimeField(auto_now_add=True)

    objects = BatchQuerySet.as_manager()

    class Meta:
        ordering = ['expiry_date', 'id']
        verbose_name_plural = 'batches'
        constraints = [
            models.UniqueConstraint(fields=['product', 'batch_no'], name='unique_batch_per_product'),
        ]
        indexes = [models.Index(fields=['product', 'expiry_date'])]

    def __str__(self):
        return f'{self.product.name} / {self.batch_no}'

    @property
    def is_expired(self):
        return self.expiry_date < timezone.localdate()

    @property
    def days_to_expiry(self):
        return (self.expiry_date - timezone.localdate()).days
