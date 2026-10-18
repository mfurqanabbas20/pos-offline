from decimal import Decimal

from django.utils import timezone
from rest_framework.test import APITestCase

from .factories import make_batch, make_product, make_user


class ApiTestCase(APITestCase):
    def setUp(self):
        self.user = make_user()
        self.client.force_authenticate(self.user)
        self.product = make_product(selling_price='10.00', purchase_price='6.00', reorder_level=5)
        self.batch = make_batch(self.product, 20, expires_in_days=100, purchase_price='6.00')


class AuthTests(APITestCase):
    def test_login_and_me(self):
        make_user('pharmacist')
        response = self.client.post('/api/auth/login/', {'username': 'pharmacist', 'password': 'pass12345'})
        self.assertEqual(response.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.data["access"]}')
        me = self.client.get('/api/auth/me/')
        self.assertEqual(me.data['username'], 'pharmacist')

    def test_endpoints_require_auth_and_errors_use_envelope(self):
        response = self.client.get('/api/products/')
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data['error']['code'], 'not_authenticated')


class SaleApiTests(ApiTestCase):
    def test_post_sale_returns_invoice_with_batch_info(self):
        response = self.client.post('/api/sales/', {
            'items': [{'product': self.product.pk, 'quantity': 2}],
            'payment_method': 'cash', 'amount_received': '50.00', 'discount': '0',
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['total'], '20.00')
        self.assertEqual(response.data['change_due'], '30.00')
        self.assertEqual(response.data['items'][0]['batch_no'], self.batch.batch_no)
        self.assertEqual(response.data['items'][0]['returnable_quantity'], 2)

    def test_validation_errors_have_consistent_shape(self):
        response = self.client.post('/api/sales/', {
            'items': [{'product': self.product.pk, 'quantity': 999}], 'payment_method': 'card',
        }, format='json')
        self.assertEqual(response.status_code, 400)
        error = response.data['error']
        self.assertEqual(error['code'], 'validation_error')
        self.assertIn('only 20 in stock', error['message'])
        self.assertIn('items', error['details'])

    def test_invoice_list_search_and_detail(self):
        sale = self.client.post('/api/sales/', {
            'items': [{'product': self.product.pk, 'quantity': 1}], 'payment_method': 'card',
            'customer_name': 'Zainab',
        }, format='json').data
        listing = self.client.get('/api/invoices/', {'search': 'Zainab'})
        self.assertEqual(listing.data['count'], 1)
        detail = self.client.get(f'/api/invoices/{sale["id"]}/')
        self.assertEqual(detail.data['number'], sale['number'])


class ReturnApiTests(ApiTestCase):
    def test_return_flow(self):
        sale = self.client.post('/api/sales/', {
            'items': [{'product': self.product.pk, 'quantity': 3}], 'payment_method': 'card',
        }, format='json').data
        item_id = sale['items'][0]['id']

        response = self.client.post('/api/returns/', {
            'invoice': sale['id'], 'reason': 'Wrong strength', 'items': [{'invoice_item': item_id, 'quantity': 2}],
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['refund_amount'], '20.00')

        invoice = self.client.get(f'/api/invoices/{sale["id"]}/').data
        self.assertEqual(invoice['status'], 'partially_returned')
        self.assertEqual(invoice['items'][0]['returnable_quantity'], 1)

        too_many = self.client.post('/api/returns/', {
            'invoice': sale['id'], 'reason': 'Again', 'items': [{'invoice_item': item_id, 'quantity': 2}],
        }, format='json')
        self.assertEqual(too_many.status_code, 400)


class InventoryAndDashboardTests(ApiTestCase):
    def test_inventory_report(self):
        low = make_product(name='Low', reorder_level=10)
        make_batch(low, 3, expires_in_days=400)
        make_batch(low, 50, expires_in_days=-1)  # expired stock doesn't count as sellable
        make_batch(self.product, 4, expires_in_days=30)

        data = self.client.get('/api/inventory/', {'days': 60}).data
        self.assertEqual([p['name'] for p in data['low_stock']], ['Low'])
        self.assertEqual(len(data['expiring']), 1)
        self.assertEqual(len(data['expired']), 1)

    def test_product_stock_is_sum_of_batches_and_barcode_lookup(self):
        make_batch(self.product, 5, expires_in_days=10)
        data = self.client.get('/api/products/', {'barcode': self.product.sku}).data
        self.assertEqual(data['count'], 1)
        self.assertEqual(data['results'][0]['stock'], 25)

    def test_dashboard_profit_is_net_of_returns(self):
        sale = self.client.post('/api/sales/', {
            'items': [{'product': self.product.pk, 'quantity': 5}], 'payment_method': 'card',
        }, format='json').data
        self.client.post('/api/returns/', {
            'invoice': sale['id'], 'reason': 'x', 'items': [{'invoice_item': sale['items'][0]['id'], 'quantity': 1}],
        }, format='json')

        data = self.client.get('/api/dashboard/', {'month': timezone.localdate().strftime('%Y-%m')}).data
        self.assertEqual(data['total_sales'], '50.00')
        self.assertEqual(data['total_returns'], '10.00')
        self.assertEqual(data['net_revenue'], '40.00')
        self.assertEqual(data['total_profit'], '16.00')  # (10-6)*5 - (10-6)*1
        self.assertEqual(data['invoice_count'], 1)
        self.assertEqual(data['top_products'][0]['quantity'], 5)
        today = next(d for d in data['daily'] if d['date'] == timezone.localdate().isoformat())
        self.assertEqual(Decimal(today['profit']), Decimal('16.00'))

    def test_dashboard_rejects_bad_month(self):
        response = self.client.get('/api/dashboard/', {'month': '2026-13'})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data['error']['code'], 'validation_error')
