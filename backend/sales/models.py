from decimal import Decimal

from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.db.models import Sum
from django.utils import timezone

from inventory.models import Batch, Product

ZERO = Decimal('0.00')
MONEY = dict(max_digits=12, decimal_places=2, validators=[MinValueValidator(ZERO)])


class NumberedModel(models.Model):
    """Assigns a human-readable number (e.g. INV-000001) derived from the primary key on first save.

    Using the PK makes numbers unique and gap-free per successful transaction without a separate
    counter row to lock.
    """

    number_prefix = ''

    number = models.CharField(max_length=20, unique=True, null=True, blank=True, editable=False)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.number:
            self.number = f'{self.number_prefix}-{self.pk:06d}'
            type(self).objects.filter(pk=self.pk).update(number=self.number)

    def __str__(self):
        return self.number or f'{self.number_prefix} (unsaved)'


class Invoice(NumberedModel):
    number_prefix = 'INV'

    class PaymentMethod(models.TextChoices):
        CASH = 'cash', 'Cash'
        CARD = 'card', 'Card'

    class Status(models.TextChoices):
        PAID = 'paid', 'Paid'
        PARTIALLY_RETURNED = 'partially_returned', 'Partially returned'
        RETURNED = 'returned', 'Returned'

    date = models.DateTimeField(default=timezone.now, db_index=True)
    customer_name = models.CharField(max_length=150, blank=True)
    subtotal = models.DecimalField(**MONEY)
    discount = models.DecimalField(**MONEY, default=ZERO)
    total = models.DecimalField(**MONEY)
    payment_method = models.CharField(max_length=10, choices=PaymentMethod.choices)
    amount_received = models.DecimalField(**MONEY)
    change_due = models.DecimalField(**MONEY, default=ZERO)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PAID, db_index=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='invoices')

    class Meta:
        ordering = ['-date', '-id']


class InvoiceItem(models.Model):
    """One line per (product, batch). A product sold across two batches produces two lines."""

    invoice = models.ForeignKey(Invoice, on_delete=models.CASCADE, related_name='items')
    product = models.ForeignKey(Product, on_delete=models.PROTECT, related_name='invoice_items')
    batch = models.ForeignKey(Batch, on_delete=models.PROTECT, related_name='invoice_items')
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit_price = models.DecimalField(**MONEY)
    unit_cost = models.DecimalField(**MONEY, help_text='Batch purchase price at the time of sale.')
    line_total = models.DecimalField(**MONEY)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.invoice} - {self.product.name} x{self.quantity}'

    @property
    def returned_quantity(self):
        annotated = getattr(self, 'returned_qty_annotated', None)
        if annotated is not None:
            return annotated
        return self.return_items.aggregate(total=Sum('quantity'))['total'] or 0

    @property
    def returnable_quantity(self):
        return self.quantity - self.returned_quantity


class Return(NumberedModel):
    number_prefix = 'RET'

    invoice = models.ForeignKey(Invoice, on_delete=models.PROTECT, related_name='returns')
    date = models.DateTimeField(default=timezone.now, db_index=True)
    reason = models.CharField(max_length=255)
    refund_amount = models.DecimalField(**MONEY)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='returns')

    class Meta:
        ordering = ['-date', '-id']


class ReturnItem(models.Model):
    return_obj = models.ForeignKey(Return, on_delete=models.CASCADE, related_name='items', db_column='return_id')
    invoice_item = models.ForeignKey(InvoiceItem, on_delete=models.PROTECT, related_name='return_items')
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    refund_amount = models.DecimalField(**MONEY)

    class Meta:
        ordering = ['id']

    def __str__(self):
        return f'{self.return_obj} - {self.invoice_item.product.name} x{self.quantity}'
