import tempfile
from pathlib import Path

from django.test import SimpleTestCase, override_settings

from core.middleware import FrontendTrailingSlashMiddleware


class FrontendTrailingSlashTests(SimpleTestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        page = Path(self.tmp.name) / 'invoices' / 'view'
        page.mkdir(parents=True)
        (page / 'index.html').write_text('<html></html>')

    def tearDown(self):
        self.tmp.cleanup()

    def mw(self):
        with override_settings(POS_FRONTEND_DIR=self.tmp.name):
            return FrontendTrailingSlashMiddleware(lambda request: 'passed-through')

    def test_adds_slash_and_keeps_query(self):
        response = self.mw()(self.client.request(PATH_INFO='/invoices/view', QUERY_STRING='id=7').wsgi_request)
        self.assertEqual(response['Location'], '/invoices/view/?id=7')

    def test_leaves_api_files_and_unknown_paths_alone(self):
        mw = self.mw()
        for path in ['/api/health', '/invoices/view/', '/favicon.svg', '/nope', '/../etc']:
            self.assertEqual(mw(self.client.request(PATH_INFO=path).wsgi_request), 'passed-through', path)
