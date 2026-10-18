"""Sale and return business rules.

All stock mutations happen here, inside ``transaction.atomic`` with ``select_for_update`` row locks
so two tills selling the last unit of a batch cannot both succeed.
"""

from collections import OrderedDict
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.db.models import F, Sum
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from inventory.models import Batch, Product

from .models import Invoice, InvoiceItem, Return, ReturnItem

ZERO = Decimal('0.00')
CENT = Decimal('0.01')


def money(value):
    return Decimal(value).quantize(CENT, rounding=ROUND_HALF_UP)


@dataclass
class SaleLine:
    product_id: int
    quantity: int


@dataclass
class ReturnLine:
    invoice_item_id: int
    quantity: int


def _merge_lines(lines, key):
    """Combine duplicate lines (e.g. the same product scanned twice) preserving first-seen order."""
    merged = OrderedDict()
    for line in lines:
        merged[getattr(line, key)] = merged.get(getattr(line, key), 0) + line.quantity
    return merged


@transaction.atomic
def create_sale(*, user, lines, payment_method, amount_received=None, discount=ZERO, customer_name='', date=None):
    """Create an invoice and deduct stock using FEFO (first expiry, first out).

    Prices come from the product record, never from the client. A product whose quantity spans several
    batches yields one invoice line per batch so each unit stays traceable to its batch and cost.
    """
    if not lines:
        raise ValidationError({'items': ['Add at least one item to the sale.']})

    requested = _merge_lines(lines, 'product_id')
    today = timezone.localdate()

    products = Product.objects.in_bulk(list(requested))
    missing = [pid for pid in requested if pid not in products]
    if missing:
        raise ValidationError({'items': [f'Unknown product id(s): {", ".join(map(str, missing))}.']})

    # Lock every candidate batch row up front, in a deterministic order, to avoid deadlocks.
    locked_batches = list(
        Batch.objects.select_for_update()
        .filter(product_id__in=list(requested), quantity__gt=0)
        .order_by('product_id', 'expiry_date', 'id')
    )
    sellable_by_product, expired_by_product = {}, {}
    for batch in locked_batches:
        bucket = expired_by_product if batch.expiry_date < today else sellable_by_product
        bucket.setdefault(batch.product_id, []).append(batch)

    errors = []
    allocations = []  # (product, batch, qty)
    for product_id, quantity in requested.items():
        product = products[product_id]
        if quantity <= 0:
            errors.append(f'{product.name}: quantity must be at least 1.')
            continue
        if not product.is_active:
            errors.append(f'{product.name} is inactive and cannot be sold.')
            continue

        batches = sellable_by_product.get(product_id, [])
        available = sum(b.quantity for b in batches)
        if quantity > available:
            expired_qty = sum(b.quantity for b in expired_by_product.get(product_id, []))
            message = f'{product.name}: only {available} in stock, {quantity} requested.'
            if expired_qty:
                message += f' {expired_qty} more unit(s) are expired and cannot be sold.'
            errors.append(message)
            continue

        remaining = quantity
        for batch in batches:  # already FEFO-ordered
            if remaining == 0:
                break
            take = min(batch.quantity, remaining)
            allocations.append((product, batch, take))
            remaining -= take

    if errors:
        raise ValidationError({'items': errors})

    subtotal = money(sum(product.selling_price * qty for product, _, qty in allocations))
    discount = money(discount or ZERO)
    if discount < 0:
        raise ValidationError({'discount': ['Discount cannot be negative.']})
    if discount > subtotal:
        raise ValidationError({'discount': ['Discount cannot exceed the subtotal.']})
    total = subtotal - discount

    if payment_method == Invoice.PaymentMethod.CARD:
        # Card payments are charged for the exact total.
        amount_received = total
    elif payment_method == Invoice.PaymentMethod.CASH:
        if amount_received is None:
            raise ValidationError({'amount_received': ['Enter the cash amount received.']})
        amount_received = money(amount_received)
        if amount_received < total:
            raise ValidationError({'amount_received': [f'Amount received is less than the total ({total}).']})
    else:
        raise ValidationError({'payment_method': ['Payment method must be cash or card.']})

    invoice = Invoice.objects.create(
        date=date or timezone.now(),
        customer_name=(customer_name or '').strip(),
        subtotal=subtotal,
        discount=discount,
        total=total,
        payment_method=payment_method,
        amount_received=amount_received,
        change_due=amount_received - total,
        created_by=user,
    )

    items = []
    for product, batch, qty in allocations:
        items.append(InvoiceItem(
            invoice=invoice,
            product=product,
            batch=batch,
            quantity=qty,
            unit_price=product.selling_price,
            unit_cost=batch.purchase_price,
            line_total=money(product.selling_price * qty),
        ))
        # F() expression keeps the decrement correct at the SQL level as well.
        Batch.objects.filter(pk=batch.pk).update(quantity=F('quantity') - qty)
    InvoiceItem.objects.bulk_create(items)
    return invoice


@transaction.atomic
def create_return(*, user, invoice_id, lines, reason, date=None):
    """Return items from an invoice: restock the original batch and refund the customer.

    Refunds are pro-rated by the invoice's discount ratio so a discounted sale is never refunded at
    full price. Invoice status is recomputed from the remaining returnable quantity.
    """
    reason = (reason or '').strip()
    if not reason:
        raise ValidationError({'reason': ['A reason is required.']})
    if not lines:
        raise ValidationError({'items': ['Select at least one item to return.']})

    try:
        invoice = Invoice.objects.select_for_update().get(pk=invoice_id)
    except Invoice.DoesNotExist:
        raise ValidationError({'invoice': ['Invoice not found.']})
    if invoice.status == Invoice.Status.RETURNED:
        raise ValidationError({'invoice': [f'Invoice {invoice.number} has already been fully returned.']})

    requested = _merge_lines(lines, 'invoice_item_id')
    invoice_items = {
        item.pk: item
        for item in InvoiceItem.objects.select_for_update().select_related('product').filter(invoice=invoice)
    }
    already_returned = dict(
        ReturnItem.objects.filter(invoice_item__invoice=invoice)
        .values_list('invoice_item_id')
        .annotate(total=Sum('quantity'))
    )

    errors = []
    for item_id, quantity in requested.items():
        item = invoice_items.get(item_id)
        if item is None:
            errors.append(f'Item {item_id} does not belong to invoice {invoice.number}.')
            continue
        returnable = item.quantity - already_returned.get(item_id, 0)
        if quantity <= 0:
            errors.append(f'{item.product.name}: quantity must be at least 1.')
        elif quantity > returnable:
            errors.append(f'{item.product.name}: only {returnable} can be returned, {quantity} requested.')
    if errors:
        raise ValidationError({'items': errors})

    # Share of the gross price the customer actually paid (1 when there was no discount).
    paid_ratio = (invoice.total / invoice.subtotal) if invoice.subtotal else Decimal('1')

    sales_return = Return.objects.create(
        invoice=invoice, date=date or timezone.now(), reason=reason, refund_amount=ZERO, created_by=user,
    )
    return_items = []
    refund_total = ZERO
    for item_id, quantity in requested.items():
        item = invoice_items[item_id]
        refund = money(item.unit_price * quantity * paid_ratio)
        refund_total += refund
        return_items.append(ReturnItem(
            return_obj=sales_return, invoice_item=item, quantity=quantity, refund_amount=refund,
        ))
        Batch.objects.select_for_update().filter(pk=item.batch_id).update(quantity=F('quantity') + quantity)

    # When this return empties the invoice, absorb per-line rounding so total refunds == invoice total.
    sold_qty = sum(item.quantity for item in invoice_items.values())
    returned_qty = sum(already_returned.values()) + sum(requested.values())
    if returned_qty >= sold_qty:
        previous_refunds = invoice.returns.exclude(pk=sales_return.pk).aggregate(t=Sum('refund_amount'))['t'] or ZERO
        adjustment = invoice.total - previous_refunds - refund_total
        if adjustment:
            return_items[-1].refund_amount += adjustment
            refund_total += adjustment
    ReturnItem.objects.bulk_create(return_items)

    sales_return.refund_amount = refund_total
    sales_return.save(update_fields=['refund_amount'])

    _refresh_invoice_status(invoice)
    return sales_return


def _refresh_invoice_status(invoice):
    sold = invoice.items.aggregate(total=Sum('quantity'))['total'] or 0
    returned = ReturnItem.objects.filter(invoice_item__invoice=invoice).aggregate(total=Sum('quantity'))['total'] or 0
    if returned == 0:
        status = Invoice.Status.PAID
    elif returned >= sold:
        status = Invoice.Status.RETURNED
    else:
        status = Invoice.Status.PARTIALLY_RETURNED
    if invoice.status != status:
        invoice.status = status
        invoice.save(update_fields=['status'])
