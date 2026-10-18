from datetime import timedelta
from decimal import Decimal
from itertools import count

from django.contrib.auth import get_user_model
from django.utils import timezone

from inventory.models import Batch, Category, Product

_seq = count(1)


def make_user(username=None, **extra):
    username = username or f'user{next(_seq)}'
    return get_user_model().objects.create_user(username=username, password='pass12345', **extra)


def make_product(name=None, selling_price='10.00', purchase_price='6.00', reorder_level=5, **extra):
    n = next(_seq)
    category, _ = Category.objects.get_or_create(name='General')
    return Product.objects.create(
        name=name or f'Product {n}',
        sku=extra.pop('sku', f'SKU{n:06d}'),
        category=category,
        selling_price=Decimal(selling_price),
        purchase_price=Decimal(purchase_price),
        reorder_level=reorder_level,
        **extra,
    )


def make_batch(product, quantity, expires_in_days, purchase_price='6.00', batch_no=None):
    return Batch.objects.create(
        product=product,
        batch_no=batch_no or f'B{next(_seq):05d}',
        expiry_date=timezone.localdate() + timedelta(days=expires_in_days),
        quantity=quantity,
        purchase_price=Decimal(purchase_price),
    )
