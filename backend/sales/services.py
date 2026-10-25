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


PIECE, PACK = 'piece', 'pack'


@dataclass
class SaleLine:
    product_id: int
    quantity: int
    unit: str = PIECE  # 'piece' (one tablet/capsule) or 'pack' (a whole box of pieces_per_pack)


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

    Stock is counted in pieces. A line may sell loose pieces or whole boxes ('pack'); a box takes
    pieces_per_pack pieces and is charged the product's box price. Prices come from the product record,
    never from the client. Each line is split per batch so every piece stays traceable to its batch and cost.
    """
    if not lines:
        raise ValidationError({'items': ['Add at least one item to the sale.']})

    # Merge duplicates per (product, unit), keeping first-seen order.
    requested = OrderedDict()
    for line in lines:
        unit = line.unit if line.unit in (PIECE, PACK) else None
        if unit is None:
            raise ValidationError({'items': [f'Unknown sale unit "{line.unit}". Use piece or pack.']})
        key = (line.product_id, unit)
        requested[key] = requested.get(key, 0) + line.quantity
    product_ids = list(dict.fromkeys(pid for pid, _ in requested))
    today = timezone.localdate()

    products = Product.objects.in_bulk(product_ids)
    missing = [pid for pid in product_ids if pid not in products]
    if missing:
        raise ValidationError({'items': [f'Unknown product id(s): {", ".join(map(str, missing))}.']})

    # Lock every candidate batch row up front, in a deterministic order, to avoid deadlocks.
    locked_batches = list(
        Batch.objects.select_for_update()
        .filter(product_id__in=product_ids, quantity__gt=0)
        .order_by('product_id', 'expiry_date', 'id')
    )
    sellable_by_product, expired_by_product = {}, {}
    for batch in locked_batches:
        bucket = expired_by_product if batch.expiry_date < today else sellable_by_product
        bucket.setdefault(batch.product_id, []).append(batch)

    errors = []
    pieces_needed = OrderedDict()
    for (product_id, unit), quantity in requested.items():
        product = products[product_id]
        if quantity <= 0:
            errors.append(f'{product.name}: quantity must be at least 1.')
        elif not product.is_active:
            errors.append(f'{product.name} is inactive and cannot be sold.')
        else:
            pieces_needed[product_id] = pieces_needed.get(product_id, 0) + quantity * _pieces_per(product, unit)

    for product_id, needed in pieces_needed.items():
        product = products[product_id]
        available = sum(b.quantity for b in sellable_by_product.get(product_id, []))
        if needed > available:
            expired_qty = sum(b.quantity for b in expired_by_product.get(product_id, []))
            message = f'{product.name}: only {_describe(product, available)} in stock, {_describe(product, needed)} requested.'
            if expired_qty:
                message += f' {expired_qty} more piece(s) are expired and cannot be sold.'
            errors.append(message)
    if errors:
        raise ValidationError({'items': errors})

    # Allocate each line's pieces FEFO, sharing the batch pool between a product's box and loose lines.
    remaining = {b.pk: b.quantity for b in locked_batches}
    allocations = []  # (product, batch, pieces, line_total, unit_price, unit, pack_size)
    for (product_id, unit), quantity in requested.items():
        product = products[product_id]
        per = _pieces_per(product, unit)
        pieces = quantity * per
        line_total = money((product.effective_pack_price if unit == PACK else product.selling_price) * quantity)
        unit_price = money(line_total / pieces)
        chunks = []
        left = pieces
        for batch in sellable_by_product.get(product_id, []):
            if left == 0:
                break
            take = min(remaining[batch.pk], left)
            if take:
                chunks.append((batch, take))
                remaining[batch.pk] -= take
                left -= take
        # Split the exact line total across batches; the last chunk absorbs rounding.
        assigned = ZERO
        for i, (batch, take) in enumerate(chunks):
            amount = line_total - assigned if i == len(chunks) - 1 else money(line_total * take / pieces)
            assigned += amount
            allocations.append((product, batch, take, amount, unit_price, unit if per > 1 else PIECE, per))

    subtotal = money(sum(a[3] for a in allocations))
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
    for product, batch, pieces, amount, unit_price, unit, per in allocations:
        items.append(InvoiceItem(
            invoice=invoice,
            product=product,
            batch=batch,
            quantity=pieces,
            unit_price=unit_price,
            unit_cost=batch.purchase_price,
            line_total=amount,
            sale_unit=unit,
            pack_size=per,
        ))
        # F() expression keeps the decrement correct at the SQL level as well.
        Batch.objects.filter(pk=batch.pk).update(quantity=F('quantity') - pieces)
    InvoiceItem.objects.bulk_create(items)
    return invoice


def _pieces_per(product, unit):
    return product.pieces_per_pack if unit == PACK else 1


def _describe(product, pieces):
    """'25 pieces (2 boxes + 5)' for boxed medicines, plain count otherwise."""
    per = product.pieces_per_pack
    if per <= 1:
        return str(pieces)
    boxes, loose = divmod(pieces, per)
    parts = [f'{boxes} box{"es" if boxes != 1 else ""}'] if boxes else []
    if loose:
        parts.append(f'{loose} loose')
    return f'{pieces} pieces ({" + ".join(parts) or "0"})'


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
        refund = money(item.line_total * quantity / item.quantity * paid_ratio)
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
