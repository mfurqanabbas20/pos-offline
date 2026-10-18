"""Consistent error envelope for every API error.

Every non-2xx response has the shape:

    {"error": {"code": "validation_error", "message": "Human readable summary", "details": {...}}}

``details`` keeps DRF's field -> [messages] mapping so forms can show inline errors.
"""

from django.core.exceptions import PermissionDenied, ValidationError as DjangoValidationError
from django.http import Http404
from rest_framework import exceptions, status
from rest_framework.response import Response
from rest_framework.views import exception_handler


def _first_message(detail):
    if isinstance(detail, dict):
        for key, value in detail.items():
            message = _first_message(value)
            if message:
                return message if key in ('non_field_errors', 'detail') else f'{key}: {message}'
    elif isinstance(detail, list):
        for value in detail:
            message = _first_message(value)
            if message:
                return message
    elif detail:
        return str(detail)
    return None


def _normalize(detail):
    """Turn DRF error detail into plain JSON (ErrorDetail -> str)."""
    if isinstance(detail, dict):
        return {key: _normalize(value) for key, value in detail.items()}
    if isinstance(detail, list):
        return [_normalize(value) for value in detail]
    return str(detail)


def api_exception_handler(exc, context):
    if isinstance(exc, DjangoValidationError):
        exc = exceptions.ValidationError(
            exc.message_dict if hasattr(exc, 'error_dict') else {'non_field_errors': exc.messages}
        )
    elif isinstance(exc, Http404):
        exc = exceptions.NotFound()
    elif isinstance(exc, PermissionDenied):
        exc = exceptions.PermissionDenied()

    response = exception_handler(exc, context)
    if response is None:
        return None

    if isinstance(exc, exceptions.ValidationError):
        code = 'validation_error'
        details = exc.detail if isinstance(exc.detail, dict) else {'non_field_errors': exc.detail}
    else:
        code = getattr(exc, 'default_code', 'error')
        details = {}

    message = _first_message(exc.detail) or 'Request failed.'
    response.data = {'error': {'code': code, 'message': message, 'details': _normalize(details)}}
    return response


def error_response(message, code='error', http_status=status.HTTP_400_BAD_REQUEST):
    return Response({'error': {'code': code, 'message': message, 'details': {}}}, status=http_status)
