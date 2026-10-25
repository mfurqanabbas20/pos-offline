"""
Django settings for the pharmacy POS backend.

All environment-specific values are read from environment variables
(optionally loaded from backend/.env). See .env.example.
"""

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
# POS_ENV_FILE lets the Windows launcher use .env.production without touching the developer's .env.
load_dotenv(os.environ.get('POS_ENV_FILE') or BASE_DIR / '.env')


def env_bool(name, default=False):
    return os.environ.get(name, str(default)).strip().lower() in ('1', 'true', 'yes', 'on')


def env_list(name, default=''):
    return [item.strip() for item in os.environ.get(name, default).split(',') if item.strip()]


SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY', 'django-insecure-dev-only-change-me')
DEBUG = env_bool('DJANGO_DEBUG', True)
ALLOWED_HOSTS = env_list('DJANGO_ALLOWED_HOSTS', 'localhost,127.0.0.1')


INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third party
    'rest_framework',
    'rest_framework_simplejwt',
    'django_filters',
    'drf_spectacular',
    'corsheaders',
    # Local
    'core',
    'accounts',
    'inventory',
    'sales',
    'reports',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'core.middleware.FrontendTrailingSlashMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'


# Database: PostgreSQL by default; DB_ENGINE=sqlite is available for quick local runs.
if os.environ.get('DB_ENGINE', 'postgres').lower() == 'sqlite':
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': os.environ.get('SQLITE_PATH', BASE_DIR / 'db.sqlite3'),
            'OPTIONS': {
                # WAL lets the dashboard read while a sale is being written; IMMEDIATE takes the write lock
                # at the start of a transaction, so two tills saving at once queue instead of failing with
                # "database is locked". busy_timeout waits up to 20 s for that lock.
                'init_command': 'PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=20000;',
                'transaction_mode': 'IMMEDIATE',
            },
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': os.environ.get('POSTGRES_DB', 'pharmacy_pos'),
            'USER': os.environ.get('POSTGRES_USER', 'postgres'),
            'PASSWORD': os.environ.get('POSTGRES_PASSWORD', ''),
            'HOST': os.environ.get('POSTGRES_HOST', 'localhost'),
            'PORT': os.environ.get('POSTGRES_PORT', '5432'),
            'CONN_MAX_AGE': 60,
        }
    }


AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


LANGUAGE_CODE = 'en-us'
TIME_ZONE = os.environ.get('TIME_ZONE', 'UTC')
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Windows 7 package: the backend also serves the pre-built app screens (Next.js static export), so the
# whole POS is one process on one port and no Node.js is needed on the PC. Point POS_FRONTEND_DIR at
# the exported folder (frontend/out). /api, /admin and /static still go to Django as usual.
POS_FRONTEND_DIR = os.environ.get('POS_FRONTEND_DIR')
if POS_FRONTEND_DIR:
    WHITENOISE_ROOT = POS_FRONTEND_DIR
    WHITENOISE_INDEX_FILE = True                       # /pos/ -> pos/index.html
    WHITENOISE_IMMUTABLE_FILE_TEST = r'^/_next/static/'  # content-hashed: cache forever

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# The POS sends no email; in production use the SMTP backend so nothing is silently printed to a console.
MAILERS = {
    'default': {
        'BACKEND': 'django.core.mail.backends.console.EmailBackend' if DEBUG
        else 'django.core.mail.backends.smtp.EmailBackend',
    },
}

# Local install: the app is served over plain HTTP to the same PC (http://localhost), with no TLS.
# HTTPS-only cookies/redirects would break the admin login there, so those deployment checks are
# acknowledged rather than "fixed". Set POS_LOCAL_HTTP=false when serving through HTTPS.
if env_bool('POS_LOCAL_HTTP', True):
    SILENCED_SYSTEM_CHECKS = ['security.W004', 'security.W008', 'security.W012', 'security.W016']
else:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30

# Logging: warnings and errors to the console, and to LOG_DIR/backend.log when LOG_DIR is set.
LOG_DIR = os.environ.get('LOG_DIR')
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {'plain': {'format': '{asctime} {levelname} {name}: {message}', 'style': '{'}},
    'handlers': {
        'console': {'class': 'logging.StreamHandler', 'formatter': 'plain'},
        **({'file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': str(Path(LOG_DIR) / 'backend.log'),
            'maxBytes': 5 * 1024 * 1024,
            'backupCount': 5,
            'encoding': 'utf-8',
            'formatter': 'plain',
        }} if LOG_DIR else {}),
    },
    'root': {'handlers': ['console', *(['file'] if LOG_DIR else [])], 'level': 'WARNING'},
}


# CORS
CORS_ALLOWED_ORIGINS = env_list('CORS_ALLOWED_ORIGINS', 'https://h7t9b6j5-3000.inc1.devtunnels.ms,http://127.0.0.1:3000')


# Django REST Framework
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
        'rest_framework.filters.SearchFilter',
        'core.filters.StableOrderingFilter',
    ],
    'DEFAULT_PAGINATION_CLASS': 'core.pagination.StandardPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'EXCEPTION_HANDLER': 'core.exceptions.api_exception_handler',
    'COERCE_DECIMAL_TO_STRING': True,
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=int(os.environ.get('JWT_ACCESS_MINUTES', '30'))),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=int(os.environ.get('JWT_REFRESH_DAYS', '7'))),
    'AUTH_HEADER_TYPES': ('Bearer',),
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'Pharmacy POS API',
    'DESCRIPTION': 'Point-of-sale API for a single pharmacy: catalog, batches, sales, returns and reporting.',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
}

# Business configuration
EXPIRY_WARNING_DAYS = int(os.environ.get('EXPIRY_WARNING_DAYS', '90'))
# Shown on downloadable reports.
PHARMACY_NAME = os.environ.get('PHARMACY_NAME', 'Tasneem Pharmacy')
