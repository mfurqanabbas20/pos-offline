"""Populate the database with demo users, catalog, batches, sales history and returns.

    python manage.py seed_data           # only seeds an empty database
    python manage.py seed_data --reset   # wipes sales + inventory first
"""

import random
from datetime import datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from inventory.models import Batch, Category, Product
from sales import services
from sales.models import Invoice, InvoiceItem, Return, ReturnItem

# (category, name, purchase_price, selling_price, reorder_level)
CATALOG = [
    ('Analgesics', 'Paracetamol 500mg Tablets (20)', '0.90', '1.50', 40),
    ('Analgesics', 'Ibuprofen 400mg Tablets (24)', '1.80', '3.20', 30),
    ('Analgesics', 'Aspirin 75mg Dispersible (28)', '1.10', '2.00', 25),
    ('Analgesics', 'Diclofenac Gel 1% 50g', '3.40', '5.99', 15),
    ('Antibiotics', 'Amoxicillin 500mg Capsules (21)', '2.60', '4.80', 20),
    ('Antibiotics', 'Azithromycin 250mg Tablets (6)', '3.90', '6.75', 15),
    ('Antibiotics', 'Ciprofloxacin 500mg Tablets (10)', '2.40', '4.20', 15),
    ('Antibiotics', 'Co-Amoxiclav 625mg Tablets (14)', '5.10', '8.90', 12),
    ('Antihistamines', 'Cetirizine 10mg Tablets (30)', '1.20', '2.40', 25),
    ('Antihistamines', 'Loratadine 10mg Tablets (30)', '1.30', '2.60', 25),
    ('Antihistamines', 'Fexofenadine 120mg Tablets (30)', '3.20', '5.50', 15),
    ('Gastrointestinal', 'Omeprazole 20mg Capsules (28)', '2.10', '3.90', 25),
    ('Gastrointestinal', 'Loperamide 2mg Capsules (12)', '1.40', '2.80', 15),
    ('Gastrointestinal', 'Oral Rehydration Salts (10 sachets)', '2.00', '3.60', 20),
    ('Gastrointestinal', 'Antacid Suspension 200ml', '2.30', '4.10', 15),
    ('Vitamins & Supplements', 'Vitamin C 1000mg Effervescent (20)', '2.80', '4.99', 20),
    ('Vitamins & Supplements', 'Vitamin D3 1000IU Softgels (60)', '3.50', '6.49', 15),
    ('Vitamins & Supplements', 'Multivitamin Adult Tablets (30)', '4.20', '7.99', 15),
    ('Vitamins & Supplements', 'Folic Acid 400mcg Tablets (90)', '1.60', '2.99', 15),
    ('Cardiovascular', 'Amlodipine 5mg Tablets (28)', '1.50', '2.90', 20),
    ('Cardiovascular', 'Atorvastatin 20mg Tablets (28)', '2.20', '4.10', 20),
    ('Cardiovascular', 'Losartan 50mg Tablets (28)', '2.00', '3.80', 20),
    ('Diabetes', 'Metformin 500mg Tablets (84)', '2.40', '4.40', 20),
    ('Diabetes', 'Glucose Test Strips (50)', '12.00', '18.50', 10),
    ('Respiratory', 'Salbutamol Inhaler 100mcg', '3.10', '5.40', 12),
    ('Respiratory', 'Cough Syrup Dextromethorphan 100ml', '2.50', '4.50', 15),
    ('Respiratory', 'Saline Nasal Spray 20ml', '2.20', '3.99', 12),
    ('Dermatology', 'Hydrocortisone Cream 1% 15g', '1.90', '3.49', 12),
    ('Dermatology', 'Clotrimazole Cream 1% 20g', '1.70', '3.20', 12),
    ('First Aid', 'Adhesive Bandages Assorted (40)', '1.50', '2.99', 20),
    ('First Aid', 'Antiseptic Solution 250ml', '2.60', '4.75', 12),
    ('First Aid', 'Digital Thermometer', '4.50', '8.99', 8),
]

USERS = [
    # username, password, first, last, is_superuser
    ('admin', 'admin123', 'Store', 'Admin', True),
    ('cashier', 'cashier123', 'Sara', 'Cashier', False),
]

RETURN_REASONS = ['Wrong item dispensed', 'Customer changed mind', 'Damaged packaging', 'Doctor changed prescription']


class Command(BaseCommand):
    help = 'Seed demo users, products, batches and ~75 days of sales history.'

    def add_arguments(self, parser):
        parser.add_argument('--reset', action='store_true', help='Delete existing sales and inventory first.')
        parser.add_argument('--days', type=int, default=75, help='Days of sales history to generate.')
        parser.add_argument('--seed', type=int, default=42, help='Random seed for reproducible data.')

    def handle(self, *args, **options):
        rng = random.Random(options['seed'])
        if options['reset']:
            self._reset()
        elif Product.objects.exists():
            self.stdout.write(self.style.WARNING('Products already exist; skipping. Use --reset to reseed.'))
            return

        users = self._create_users()
        products = self._create_catalog(rng)
        invoices, returns = self._create_history(rng, users, products, options['days'])
        self._create_current_stock(rng, products)
        self.stdout.write(self.style.SUCCESS(
            f'Seeded {len(products)} products, {Batch.objects.count()} batches, '
            f'{invoices} invoices and {returns} returns.'
        ))
        self.stdout.write('Logins: admin / admin123 (superuser), cashier / cashier123')

    @transaction.atomic
    def _reset(self):
        ReturnItem.objects.all().delete()
        Return.objects.all().delete()
        InvoiceItem.objects.all().delete()
        Invoice.objects.all().delete()
        Batch.objects.all().delete()
        Product.objects.all().delete()
        Category.objects.all().delete()
        self.stdout.write('Cleared sales and inventory data.')

    def _create_users(self):
        User = get_user_model()
        users = []
        for username, password, first, last, is_super in USERS:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={'first_name': first, 'last_name': last, 'is_staff': is_super, 'is_superuser': is_super},
            )
            if created:
                user.set_password(password)
                user.save()
            users.append(user)
        return users

    @transaction.atomic
    def _create_catalog(self, rng):
        products = []
        for index, (category_name, name, cost, price, reorder) in enumerate(CATALOG):
            category, _ = Category.objects.get_or_create(name=category_name)
            product = Product.objects.create(
                name=name,
                sku=f'890{index + 1:010d}',  # 13-digit, barcode-like
                category=category,
                purchase_price=Decimal(cost),
                selling_price=Decimal(price),
                reorder_level=reorder,
            )
            products.append(product)
            # Opening stock large enough to cover the generated sales history.
            self._add_batch(rng, product, days=rng.randint(300, 720), qty=rng.randint(250, 400))
        return products

    def _add_batch(self, rng, product, days, qty):
        sequence = product.batches.count() + 1
        Batch.objects.create(
            product=product,
            batch_no=f'B{timezone.localdate():%y}{product.pk:03d}{sequence}',
            expiry_date=timezone.localdate() + timedelta(days=days),
            quantity=qty,
            purchase_price=(product.purchase_price * Decimal(rng.choice(['0.95', '1.00', '1.05']))).quantize(
                Decimal('0.01')
            ),
        )

    @transaction.atomic
    def _create_current_stock(self, rng, products):
        """After history, shape today's stock so every alert type on the dashboard has examples.

        Done after the sales run because FEFO would otherwise (correctly) sell the short-dated batches first.
        """
        for index, product in enumerate(products):
            if index % 5 == 0:
                # Stock-count adjustment leaving the product below its reorder level.
                batch = product.batches.order_by('-expiry_date').first()
                batch.quantity = rng.randint(0, product.reorder_level // 2)
                batch.save(update_fields=['quantity'])
                continue
            self._add_batch(rng, product, days=rng.randint(365, 900), qty=rng.randint(80, 200))  # fresh delivery
            if index % 3 == 0:
                self._add_batch(rng, product, days=rng.randint(15, 85), qty=rng.randint(10, 40))  # expiring soon
            if index % 7 == 1:
                self._add_batch(rng, product, days=-rng.randint(5, 60), qty=rng.randint(3, 12))  # expired

    def _create_history(self, rng, users, products, days):
        now = timezone.localtime()
        tz = timezone.get_current_timezone()
        popular = products[:12]
        invoice_count = return_count = 0

        for offset in range(days, -1, -1):
            day = (now - timedelta(days=offset)).date()
            for _ in range(rng.randint(2, 7)):
                sold_at = timezone.make_aware(datetime.combine(day, time(rng.randint(9, 20), rng.randint(0, 59))), tz)
                if sold_at > now:
                    continue
                picks = rng.sample(products, rng.randint(1, 3))
                if rng.random() < 0.5:
                    picks.append(rng.choice(popular))
                lines = [services.SaleLine(product_id=p.pk, quantity=rng.randint(1, 3)) for p in set(picks)]
                cash = rng.random() < 0.65
                discount = Decimal(rng.choice(['0', '0', '0', '0.50', '1.00']))
                try:
                    invoice = services.create_sale(
                        user=rng.choice(users), lines=lines,
                        payment_method='cash' if cash else 'card',
                        amount_received=Decimal('500') if cash else None,
                        discount=discount, customer_name=rng.choice(['', '', 'Walk-in', 'A. Khan', 'M. Ali', 'J. Smith']),
                        date=sold_at,
                    )
                except ValidationError:
                    continue  # out of stock for this random basket; skip it
                # Cash customers hand over a round amount; recompute change for realism.
                if cash:
                    received = (invoice.total / 5).to_integral_value(rounding='ROUND_CEILING') * 5
                    Invoice.objects.filter(pk=invoice.pk).update(
                        amount_received=received, change_due=received - invoice.total
                    )
                invoice_count += 1

                if rng.random() < 0.06:
                    item = invoice.items.first()
                    services.create_return(
                        user=rng.choice(users), invoice_id=invoice.pk,
                        lines=[services.ReturnLine(invoice_item_id=item.pk, quantity=1)],
                        reason=rng.choice(RETURN_REASONS),
                        date=min(sold_at + timedelta(days=rng.randint(0, 3)), now),
                    )
                    return_count += 1
        return invoice_count, return_count
