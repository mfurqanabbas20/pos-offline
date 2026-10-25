from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response


class StandardPagination(PageNumberPagination):
    """Page-number pagination used by every list endpoint.

    Response: {count, total_pages, page, page_size, next, previous, results}.
    ``page_size`` is adjustable up to ``max_page_size`` so screens can load more rows per scroll.
    """

    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 200

    def get_paginated_response(self, data):
        return Response({
            'count': self.page.paginator.count,
            'total_pages': self.page.paginator.num_pages,
            'page': self.page.number,
            'page_size': self.get_page_size(self.request),
            'next': self.get_next_link(),
            'previous': self.get_previous_link(),
            'results': data,
        })

    def get_paginated_response_schema(self, schema):
        response = super().get_paginated_response_schema(schema)
        response['properties'].update({
            'total_pages': {'type': 'integer', 'example': 5},
            'page': {'type': 'integer', 'example': 1},
            'page_size': {'type': 'integer', 'example': 20},
        })
        response['required'] = ['count', 'total_pages', 'page', 'page_size', 'results']
        return response
