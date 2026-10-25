from decimal import Decimal

from django.test import TestCase
from rest_framework.exceptions import ValidationError

from sales import services
from sales.models import Invoice
from sales.services import ReturnLine, SaleLine

from .factories import make_batch, make_product, make_user


def sell(user, *lines, payment_method='card', **kwargs):
    return services.create_sale(
        user=user, lines=[SaleLine(product_id=p.pk, quantity=q) for p, q in lines],
        payment_method=payment_method, **kwargs,
    )


class FefoTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.product = make_product(selling_price='10.00')

    def test_sale_takes_stock_from_earliest_expiry_first(self):
        late = make_batch(self.product, 10, expires_in_days=300, batch_no='LATE')
        early = make_batch(self.product, 10, expires_in_days=30, batch_no='EARLY')

        invoice = sell(self.user, (self.product, 4))

        early.refresh_from_db()
        late.refresh_from_db()
        self.assertEqual(early.quantity, 6)
        self.assertEqual(late.quantity, 10)
        self.assertEqual([i.batch_id for i in invoice.items.all()], [early.pk])

    def test_sale_spanning_batches_creates_one_line_per_batch_with_batch_cost(self):
        early = make_batch(self.product, 3, expires_in_days=10, purchase_price='5.00')
        late = make_batch(self.product, 10, expires_in_days=200, purchase_price='7.00')

        invoice = sell(self.user, (self.product, 5))

        items = list(invoice.items.order_by('id'))
        self.assertEqual([(i.batch_id, i.quantity, i.unit_cost) for i in items],
                         [(early.pk, 3, Decimal('5.00')), (late.pk, 2, Decimal('7.00'))])
        early.refresh_from_db()
        late.refresh_from_db()
        self.assertEqual((early.quantity, late.quantity), (0, 8))

    def test_expired_batches_are_skipped(self):
        expired = make_batch(self.product, 50, expires_in_days=-1)
        good = make_batch(self.product, 5, expires_in_days=100)

        invoice = sell(self.user, (self.product, 2))

        self.assertEqual(invoice.items.get().batch_id, good.pk)
        expired.refresh_from_db()
        self.assertEqual(expired.quantity, 50)

    def test_batch_expiring_today_is_still_sellable(self):
        today_batch = make_batch(self.product, 5, expires_in_days=0)
        invoice = sell(self.user, (self.product, 1))
        self.assertEqual(invoice.items.get().batch_id, today_batch.pk)


class SaleTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.product = make_product(selling_price='10.00')
        self.batch = make_batch(self.product, 10, expires_in_days=100, purchase_price='6.00')

    def test_cash_sale_computes_totals_and_change(self):
        invoice = sell(self.user, (self.product, 3), payment_method='cash',
                       amount_received=Decimal('50'), discount=Decimal('2.00'), customer_name='  Ali ')

        self.assertEqual(invoice.subtotal, Decimal('30.00'))
        self.assertEqual(invoice.total, Decimal('28.00'))
        self.assertEqual(invoice.change_due, Decimal('22.00'))
        self.assertEqual(invoice.customer_name, 'Ali')
        self.assertEqual(invoice.status, Invoice.Status.PAID)
        self.assertRegex(invoice.number, r'^INV-\d{6}$')
        item = invoice.items.get()
        self.assertEqual((item.unit_price, item.unit_cost, item.line_total),
                         (Decimal('10.00'), Decimal('6.00'), Decimal('30.00')))

    def test_card_sale_charges_exact_total(self):
        invoice = sell(self.user, (self.product, 2), payment_method='card', amount_received=Decimal('999'))
        self.assertEqual(invoice.amount_received, invoice.total)
        self.assertEqual(invoice.change_due, Decimal('0.00'))

    def test_duplicate_lines_are_merged(self):
        invoice = sell(self.user, (self.product, 2), (self.product, 3))
        self.assertEqual(invoice.items.get().quantity, 5)

    def test_quantity_above_stock_is_blocked_and_nothing_changes(self):
        with self.assertRaises(ValidationError) as ctx:
            sell(self.user, (self.product, 11))
        self.assertIn('only 10 in stock', str(ctx.exception.detail))
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.quantity, 10)
        self.assertFalse(Invoice.objects.exists())

    def test_only_expired_stock_is_blocked_with_explanation(self):
        other = make_product()
        make_batch(other, 20, expires_in_days=-5)
        with self.assertRaises(ValidationError) as ctx:
            sell(self.user, (other, 1))
        self.assertIn('expired', str(ctx.exception.detail))

    def test_failure_on_one_line_rolls_back_whole_sale(self):
        other = make_product()
        make_batch(other, 1, expires_in_days=50)
        with self.assertRaises(ValidationError):
            sell(self.user, (self.product, 2), (other, 5))
        self.batch.refresh_from_db()
        self.assertEqual(self.batch.quantity, 10)

    def test_insufficient_cash_is_rejected(self):
        with self.assertRaises(ValidationError):
            sell(self.user, (self.product, 1), payment_method='cash', amount_received=Decimal('5'))

    def test_discount_cannot_exceed_subtotal(self):
        with self.assertRaises(ValidationError):
            sell(self.user, (self.product, 1), discount=Decimal('10.01'))

    def test_inactive_product_cannot_be_sold(self):
        self.product.is_active = False
        self.product.save()
        with self.assertRaises(ValidationError):
            sell(self.user, (self.product, 1))


class ReturnTests(TestCase):
    def setUp(self):
        self.user = make_user()
        self.product = make_product(selling_price='10.00')
        self.early = make_batch(self.product, 2, expires_in_days=20)
        self.late = make_batch(self.product, 10, expires_in_days=200)
        self.invoice = sell(self.user, (self.product, 5))  # 2 from early, 3 from late
        self.early_item, self.late_item = self.invoice.items.order_by('id')

    def ret(self, *lines, reason='Damaged'):
        return services.create_return(
            user=self.user, invoice_id=self.invoice.pk, reason=reason,
            lines=[ReturnLine(invoice_item_id=i.pk, quantity=q) for i, q in lines],
        )

    def test_return_restocks_original_batch(self):
        self.ret((self.early_item, 1))
        self.early.refresh_from_db()
        self.late.refresh_from_db()
        self.assertEqual(self.early.quantity, 1)  # 0 after sale, +1 returned
        self.assertEqual(self.late.quantity, 7)   # untouched

    def test_partial_then_full_return_updates_status(self):
        sales_return = self.ret((self.late_item, 1))
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.PARTIALLY_RETURNED)
        self.assertEqual(sales_return.refund_amount, Decimal('10.00'))
        self.assertRegex(sales_return.number, r'^RET-\d{6}$')

        self.ret((self.early_item, 2), (self.late_item, 2))
        self.invoice.refresh_from_db()
        self.assertEqual(self.invoice.status, Invoice.Status.RETURNED)

    def test_cannot_return_more_than_sold_minus_already_returned(self):
        self.ret((self.late_item, 2))
        with self.assertRaises(ValidationError) as ctx:
            self.ret((self.late_item, 2))
        self.assertIn('only 1 can be returned', str(ctx.exception.detail))

    def test_cannot_return_item_from_another_invoice(self):
        other_invoice = sell(self.user, (self.product, 1))
        with self.assertRaises(ValidationError):
            services.create_return(
                user=self.user, invoice_id=self.invoice.pk, reason='x',
                lines=[ReturnLine(invoice_item_id=other_invoice.items.get().pk, quantity=1)],
            )

    def test_reason_is_required(self):
        with self.assertRaises(ValidationError):
            self.ret((self.late_item, 1), reason='  ')

    def test_refund_is_prorated_by_discount_and_totals_match_on_full_return(self):
        product = make_product(selling_price='3.00')
        make_batch(product, 10, expires_in_days=100)
        invoice = sell(self.user, (product, 3), discount=Decimal('1.00'))  # 9.00 - 1.00 = 8.00
        item = invoice.items.get()

        refunds = [
            services.create_return(user=self.user, invoice_id=invoice.pk, reason='r',
                                   lines=[ReturnLine(invoice_item_id=item.pk, quantity=1)]).refund_amount
            for _ in range(3)
        ]
        self.assertEqual(refunds[0], Decimal('2.67'))
        self.assertEqual(sum(refunds), invoice.total)


class PackSaleTests(TestCase):
    """A box of 10 capsules: sell whole boxes or loose capsules from the same stock."""

    def setUp(self):
        self.user = make_user()
        self.product = make_product(selling_price='30.00', purchase_price='20.00')
        self.product.pieces_per_pack = 10
        self.product.pack_price = Decimal('280.00')  # box discount: 10 x 30 would be 300
        self.product.save()
        self.early = make_batch(self.product, 15, expires_in_days=30, purchase_price='20.00')
        self.late = make_batch(self.product, 30, expires_in_days=300, purchase_price='20.00')

    def sell(self, *lines, **kwargs):
        return services.create_sale(
            user=self.user, payment_method='card',
            lines=[SaleLine(product_id=self.product.pk, quantity=q, unit=u) for q, u in lines], **kwargs,
        )

    def test_box_sale_takes_ten_pieces_at_box_price(self):
        invoice = self.sell((1, 'pack'))
        self.assertEqual(invoice.total, Decimal('280.00'))
        item = invoice.items.get()
        self.assertEqual((item.quantity, item.sale_unit, item.pack_size), (10, 'pack', 10))
        self.early.refresh_from_db()
        self.assertEqual(self.early.quantity, 5)

    def test_loose_pieces_use_piece_price(self):
        invoice = self.sell((3, 'piece'))
        self.assertEqual(invoice.total, Decimal('90.00'))
        self.assertEqual(invoice.items.get().sale_unit, 'piece')

    def test_box_spanning_two_batches_keeps_exact_total(self):
        invoice = self.sell((2, 'pack'))  # 20 pieces: 15 from early batch, 5 from late
        items = list(invoice.items.order_by('id'))
        self.assertEqual([i.quantity for i in items], [15, 5])
        self.assertEqual(sum(i.line_total for i in items), Decimal('560.00'))
        self.assertEqual(invoice.total, Decimal('560.00'))

    def test_box_and_loose_share_stock_and_are_checked_together(self):
        invoice = self.sell((2, 'pack'), (5, 'piece'))  # 25 of 45 pieces
        self.assertEqual(invoice.total, Decimal('710.00'))
        with self.assertRaises(ValidationError) as ctx:
            self.sell((2, 'pack'), (1, 'piece'))  # 21 > 20 left
        self.assertIn('2 boxes', str(ctx.exception.detail))

    def test_default_box_price_is_pieces_times_piece_price(self):
        self.product.pack_price = None
        self.product.save()
        self.assertEqual(self.sell((1, 'pack')).total, Decimal('300.00'))

    def test_partial_return_from_a_box_refunds_proportionally(self):
        invoice = self.sell((1, 'pack'))
        item = invoice.items.get()
        ret = services.create_return(
            user=self.user, invoice_id=invoice.pk, reason='Only needed 6',
            lines=[ReturnLine(invoice_item_id=item.pk, quantity=4)],
        )
        self.assertEqual(ret.refund_amount, Decimal('112.00'))  # 4/10 of 280
        self.early.refresh_from_db()
        self.assertEqual(self.early.quantity, 9)
