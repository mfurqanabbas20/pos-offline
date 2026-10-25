from rest_framework.filters import OrderingFilter


class StableOrderingFilter(OrderingFilter):
    """OrderingFilter that always ends with a unique key.

    Without a tie-breaker, rows sharing a sort value (two medicines with the same price, two sales in
    the same second) can swap places between page requests, so infinite scrolling would show one twice
    and skip another. Appending the primary key makes every page boundary deterministic.
    """

    def get_ordering(self, request, queryset, view):
        ordering = list(super().get_ordering(request, queryset, view) or queryset.query.order_by or [])
        if not any(field.lstrip('-') in ('id', 'pk') for field in ordering):
            # Follow the direction of the main sort so "newest first" stays newest first.
            descending = bool(ordering) and ordering[0].startswith('-')
            ordering.append('-id' if descending else 'id')
        return ordering
