"""Receive a delivery in one step: optionally create the medicine, then add its stock.

Designed for the guided "Add stock" screen, so it accepts what a shop owner actually knows:
the total paid for the delivery (not the cost per tablet), and no batch number if the box
doesn't show one clearly.
"""

from decimal import ROUND_HALF_UP, Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from .models import Batch, Category, Product

CENT = Decimal('0.01')


class NewProductSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=200)
    sku = serializers.CharField(max_length=64, required=False, allow_blank=True)
    category = serializers.CharField(max_length=100)
    reorder_level = serializers.IntegerField(min_value=0, required=False, default=10)


class ReceiveStockSerializer(serializers.Serializer):
    product = serializers.IntegerField(min_value=1, required=False)
    new_product = NewProductSerializer(required=False)
    quantity = serializers.IntegerField(min_value=1, max_value=1_000_000)
    expiry_date = serializers.DateField()
    batch_no = serializers.CharField(max_length=64, required=False, allow_blank=True)
    total_cost = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, allow_null=True)
    unit_cost = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, allow_null=True)
    selling_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, allow_null=True)
    pieces_per_pack = serializers.IntegerField(min_value=1, max_value=10000, required=False)
    pack_price = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=0, required=False, allow_null=True)

    def validate(self, attrs):
        if bool(attrs.get('product')) == bool(attrs.get('new_product')):
            raise serializers.ValidationError({'product': 'Choose a medicine, or enter a new one.'})
        if attrs['expiry_date'] < timezone.localdate():
            raise serializers.ValidationError({'expiry_date': 'This expiry date has already passed. Check the date on the box.'})
        if attrs.get('new_product') and attrs.get('selling_price') is None:
            raise serializers.ValidationError({'selling_price': 'Enter the sale price for a new medicine.'})
        return attrs


def _auto_sku():
    """MED-0001 style code for medicines without a barcode."""
    n = Product.objects.count() + 1
    while Product.objects.filter(sku__iexact=f'MED-{n:04d}').exists():
        n += 1
    return f'MED-{n:04d}'


def _auto_batch_no(product, expiry):
    """Readable, unique per product: EXP2712-01 = expires Dec 2027, first delivery with that code."""
    base = f'EXP{expiry:%y%m}'
    n = 1
    while Batch.objects.filter(product=product, batch_no__iexact=f'{base}-{n:02d}').exists():
        n += 1
    return f'{base}-{n:02d}'


@transaction.atomic
def receive_stock(data):
    quantity = data['quantity']

    if data.get('product'):
        try:
            product = Product.objects.select_for_update().get(pk=data['product'])
        except Product.DoesNotExist:
            raise ValidationError({'product': 'That medicine no longer exists.'})
        created = False
    else:
        new = data['new_product']
        name = new['name'].strip()
        sku = (new.get('sku') or '').strip()
        existing = Product.objects.filter(name__iexact=name).first()
        if existing:
            raise ValidationError({'new_product': [
                f'"{existing.name}" is already in your list. Go back and choose it instead of adding it again.'
            ]})
        if sku and Product.objects.filter(sku__iexact=sku).exists():
            other = Product.objects.get(sku__iexact=sku)
            raise ValidationError({'new_product': [f'Barcode {sku} already belongs to "{other.name}".']})
        category, _ = Category.objects.get_or_create(
            name__iexact=new['category'].strip(), defaults={'name': new['category'].strip()}
        )
        product = Product(
            name=name, sku=sku or _auto_sku(), category=category,
            purchase_price=Decimal('0.00'), selling_price=Decimal('0.00'),
            reorder_level=new.get('reorder_level', 10),
        )
        created = True

    # Cost per unit: from the delivery total if given, else per unit, else the last known cost.
    if data.get('total_cost') is not None:
        unit_cost = (Decimal(data['total_cost']) / quantity).quantize(CENT, rounding=ROUND_HALF_UP)
    elif data.get('unit_cost') is not None:
        unit_cost = Decimal(data['unit_cost'])
    elif not created:
        unit_cost = product.purchase_price
    else:
        raise ValidationError({'total_cost': ['Enter how much you paid for this delivery.']})

    selling = data.get('selling_price')
    selling = Decimal(selling) if selling is not None else product.selling_price
    if selling < unit_cost:
        raise ValidationError({'selling_price': [
            f'The sale price (Rs {selling}) is lower than what you paid for one (Rs {unit_cost}). You would lose money.'
        ]})

    if data.get('pieces_per_pack'):
        product.pieces_per_pack = data['pieces_per_pack']
    if 'pack_price' in data:
        product.pack_price = data['pack_price'] if product.pieces_per_pack > 1 else None
    if product.pack_price is not None and product.pack_price < unit_cost * product.pieces_per_pack:
        raise ValidationError({'pack_price': [
            f'The box price (Rs {product.pack_price}) is lower than what a box costs you '
            f'(Rs {unit_cost * product.pieces_per_pack}).'
        ]})

    product.purchase_price = unit_cost   # latest cost becomes the default for the next delivery
    product.selling_price = selling
    product.save()

    batch_no = (data.get('batch_no') or '').strip() or _auto_batch_no(product, data['expiry_date'])
    if Batch.objects.filter(product=product, batch_no__iexact=batch_no).exists():
        raise ValidationError({'batch_no': [f'Batch {batch_no} is already recorded for this medicine.']})
    batch = Batch.objects.create(
        product=product, batch_no=batch_no, expiry_date=data['expiry_date'],
        quantity=quantity, purchase_price=unit_cost,
    )
    return product, batch, created
