import io
from datetime import date
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook, load_workbook
from rest_framework.test import APITestCase

from sales.tests.factories import make_batch, make_product, make_user

from .models import Batch, Category, Product

HEADERS = ['SKU / Barcode *', 'Product name *', 'Category *', 'Purchase price *', 'Selling price *',
           'Reorder level', 'Batch no', 'Expiry date', 'Quantity', 'Batch unit cost']
XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def xlsx(*rows, headers=HEADERS):
    wb = Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(list(row))
    buffer = io.BytesIO()
    wb.save(buffer)
    return SimpleUploadedFile('stock.xlsx', buffer.getvalue(), content_type=XLSX)


PANADOL = ['PANADOL-500', 'Panadol 500mg Capsule', 'Analgesics', 6, 8, 20, 'PN2401', date(2027, 6, 30), 50, None]


class InventoryImportTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(make_user())

    def upload(self, file, commit=False):
        return self.client.post('/api/inventory/import/', {'file': file, 'commit': 'true' if commit else 'false'},
                                format='multipart')

    def test_preview_writes_nothing(self):
        response = self.upload(xlsx(PANADOL))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data['committed'])
        self.assertEqual(response.data['summary']['products_to_create'], 1)
        self.assertEqual(response.data['summary']['units_to_add'], 50)
        self.assertFalse(Product.objects.exists())

    def test_commit_creates_category_product_and_batch(self):
        response = self.upload(xlsx(PANADOL), commit=True)
        self.assertEqual(response.status_code, 200, response.data)
        product = Product.objects.get(sku='PANADOL-500')
        self.assertEqual(product.category.name, 'Analgesics')
        self.assertEqual(product.selling_price, Decimal('8.00'))
        self.assertEqual(product.reorder_level, 20)
        batch = product.batches.get()
        self.assertEqual((batch.batch_no, batch.quantity, batch.expiry_date, batch.purchase_price),
                         ('PN2401', 50, date(2027, 6, 30), Decimal('6.00')))

    def test_existing_sku_is_updated_and_restocked_blank_cells_kept(self):
        product = make_product(sku='SKU1', selling_price='5.00', purchase_price='3.00', reorder_level=7)
        row = ['SKU1', '', '', '', '6.50', '', 'NEW1', '2028-01-31', 12, '']
        response = self.upload(xlsx(row), commit=True)
        self.assertEqual(response.status_code, 200, response.data)
        product.refresh_from_db()
        self.assertEqual(product.selling_price, Decimal('6.50'))
        self.assertEqual(product.purchase_price, Decimal('3.00'))  # blank → unchanged
        self.assertEqual(product.reorder_level, 7)
        self.assertEqual(product.batches.get(batch_no='NEW1').quantity, 12)

    def test_any_error_blocks_the_whole_import(self):
        bad = ['BAD', 'Bad row', 'Misc', 'abc', 5, '', '', '', '', '']
        preview = self.upload(xlsx(PANADOL, bad))
        self.assertEqual(preview.data['summary']['error_rows'], 1)
        self.assertIn('is not a number', preview.data['rows'][1]['errors'][0])
        self.assertEqual(preview.data['rows'][1]['row'], 3)  # spreadsheet row number

        commit = self.upload(xlsx(PANADOL, bad), commit=True)
        self.assertEqual(commit.status_code, 400)
        self.assertFalse(Product.objects.exists())
        self.assertFalse(Category.objects.exists())

    def test_reimporting_same_batch_is_rejected(self):
        self.upload(xlsx(PANADOL), commit=True)
        again = self.upload(xlsx(PANADOL))
        self.assertIn('already exists', again.data['rows'][0]['errors'][0])
        self.assertEqual(Batch.objects.get().quantity, 50)

    def test_batch_fields_must_come_together_and_selling_not_below_cost(self):
        rows = [
            ['A1', 'Thing', 'Misc', 5, 4, '', '', '', '', ''],              # selling < purchase
            ['A2', 'Thing 2', 'Misc', 1, 2, '', 'B1', '', 10, ''],          # missing expiry
        ]
        data = self.upload(xlsx(*rows)).data
        self.assertIn('below purchase price', data['rows'][0]['errors'][0])
        self.assertIn('Expiry date is required', ' '.join(data['rows'][1]['errors']))

    def test_numeric_barcode_and_csv_supported(self):
        csv_file = SimpleUploadedFile(
            'stock.csv',
            b'Barcode,Name,Category,Cost,Price,Batch,Expiry,Qty\n8901234567890,Cetirizine 10mg,Allergy,1.2,2.4,C1,30/06/2027,30\n',
            content_type='text/csv',
        )
        response = self.upload(csv_file, commit=True)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(Product.objects.get().sku, '8901234567890')
        self.assertEqual(Batch.objects.get().expiry_date, date(2027, 6, 30))

    def test_missing_required_column_and_wrong_file_type(self):
        response = self.upload(xlsx(['x'], headers=['SKU']))
        self.assertEqual(response.status_code, 400)
        self.assertIn('Missing column', response.data['error']['message'])
        response = self.upload(SimpleUploadedFile('stock.pdf', b'%PDF', content_type='application/pdf'))
        self.assertIn('.xlsx', response.data['error']['message'])

    def test_template_download_is_valid_workbook(self):
        response = self.client.get('/api/inventory/import/template/')
        self.assertEqual(response.status_code, 200)
        wb = load_workbook(io.BytesIO(response.content))
        self.assertEqual(wb.active['A1'].value, 'SKU / Barcode *')
        self.assertEqual(wb.active['B2'].value, 'Panadol 500mg Capsule')

    def test_existing_batch_from_other_product_does_not_clash(self):
        other = make_product(sku='OTHER')
        make_batch(other, 5, expires_in_days=100, batch_no='PN2401')
        response = self.upload(xlsx(PANADOL), commit=True)
        self.assertEqual(response.status_code, 200, response.data)
