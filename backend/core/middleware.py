from pathlib import Path

from django.conf import settings
from django.http import HttpResponsePermanentRedirect


class FrontendTrailingSlashMiddleware:
    """Windows 7 package: /invoices/view?id=7 -> /invoices/view/?id=7, keeping the query string.

    The exported screens live at <page>/index.html. WhiteNoise also adds the missing slash, but drops
    the query string, so a refreshed receipt or invoice page would lose its ?id=. Only active when the
    backend serves the screens (POS_FRONTEND_DIR) and only for paths that are real exported pages.
    """

    def __init__(self, get_response):
        self.get_response = get_response
        root = getattr(settings, 'POS_FRONTEND_DIR', None)
        self.root = Path(root).resolve() if root else None

    def __call__(self, request):
        path = request.path
        if self.root and not path.endswith('/') and '.' not in path.rsplit('/', 1)[-1]:
            index = (self.root / path.lstrip('/') / 'index.html').resolve()
            if index.is_relative_to(self.root) and index.is_file():
                query = request.META.get('QUERY_STRING', '')
                return HttpResponsePermanentRedirect(f'{path}/' + (f'?{query}' if query else ''))
        return self.get_response(request)
