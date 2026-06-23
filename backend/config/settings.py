from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent
import sys
sys.path.insert(0, str(BASE_DIR))

SECRET_KEY = os.getenv('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    from django.core.exceptions import ImproperlyConfigured
    raise ImproperlyConfigured('DJANGO_SECRET_KEY не задан в .env')

DEBUG = os.getenv('DEBUG', 'False') == 'True'

# Пустое значение даёт [], а не [''] (иначе при DEBUG=False все запросы -> 400)
ALLOWED_HOSTS = [h.strip() for h in os.getenv('DJANGO_ALLOWED_HOSTS', '').split(',') if h.strip()]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'corsheaders',
    'apps.users',
    'apps.products',
    'apps.orders',
    'apps.cart',
    'apps.notifications',
    'apps.chat',
    'django_celery_results',
    'drf_spectacular',
    'rest_framework_simplejwt.token_blacklist',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
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

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.getenv('POSTGRES_DB'),
        'USER': os.getenv('POSTGRES_USER'),
        'PASSWORD': os.getenv('POSTGRES_PASSWORD'),
        'HOST': os.getenv('POSTGRES_HOST'),
        'PORT': os.getenv('POSTGRES_PORT'),
    }
}


LANGUAGE_CODE = 'ru-ru'
TIME_ZONE = 'Europe/Moscow'
USE_I18N = True
USE_TZ = True

STATIC_URL = 'static/'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'
AUTH_USER_MODEL = 'users.User'

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


from datetime import timedelta

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}


REDIS_URL = os.getenv('REDIS_URL', 'redis://redis:6379/0')

# Кэш каталога/карточки (P6b) - отдельная БД Redis от корзины (REDIS_URL=/0),
# чтобы очистка кэша не задевала корзины пользователей.
CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.redis.RedisCache',
        'LOCATION': os.getenv('REDIS_CACHE_URL', 'redis://redis:6379/1'),
    }
}
ELASTICSEARCH_URL = os.getenv('ELASTICSEARCH_URL', 'http://elasticsearch:9200')
CELERY_BROKER_URL = os.getenv('RABBITMQ_URL', 'amqp://guest:guest@rabbitmq:5672/')
CELERY_RESULT_BACKEND = 'django-db'
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
DEFAULT_FROM_EMAIL = os.getenv('DEFAULT_FROM_EMAIL', 'noreply@marketplace.com')
# Письма идут через Resend SDK напрямую (apps/notifications/tasks.py - центр Ф25;
# apps/users - OTP), Django email-backend не используется.
KAFKA_BOOTSTRAP_SERVERS = os.getenv('KAFKA_BOOTSTRAP_SERVERS', 'kafka:9092')
CLICKHOUSE_HOST = os.getenv('CLICKHOUSE_HOST', 'clickhouse')
CLICKHOUSE_PORT = int(os.getenv('CLICKHOUSE_PORT', 9000))

# Рекомендации (P8): C++-сервис ко-покупок + общий файл матрицы.
# CPP_SERVICE_TIMEOUT держит HTTP-путь от зависания на недоступном C++ (как в P5
# для ClickHouse/Kafka) - при таймауте RecommendationsView уходит в fallback.
CPP_SERVICE_URL = os.getenv('CPP_SERVICE_URL', 'http://recommender:8080/')
CPP_SERVICE_TIMEOUT = float(os.getenv('CPP_SERVICE_TIMEOUT', '1.5'))
# Файл матрицы ко-покупок в общем volume: пишет Celery (build_copurchase_matrix),
# читает C++. Один путь для обоих контейнеров.
RECOMMENDER_MATRIX_PATH = os.getenv('RECOMMENDER_MATRIX_PATH', '/data/copurchase_matrix.txt')

# Периодический пересчёт матрицы ко-покупок (P8). Запускается процессом celery beat;
# для демо/после сида заказов тот же расчёт даёт management-команда build_recommendations.
CELERY_BEAT_SCHEDULE = {
    'build-copurchase-matrix': {
        'task': 'apps.products.tasks.build_copurchase_matrix',
        'schedule': float(os.getenv('MATRIX_REBUILD_INTERVAL', str(60 * 60))),  # раз в час
    },
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'Marketplace API',
    'DESCRIPTION': 'API маркетплейса с поиском, аналитикой и рекомендациями',
    'VERSION': '1.0.0',
}

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/day',
        'user': '1000/day',
        'login': '10/minute',
        'register': '5/minute',
        'verify': '5/minute',
        'password_reset': '5/minute',
        'chat': '30/minute',
    },
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
}
RESEND_API_KEY = os.getenv('RESEND_API_KEY', '')

# Базовый URL для абсолютных ссылок в письмах (one-click отписка, Ф25). Дефолт -
# локальный API; в проде задаётся через окружение.
SITE_URL = os.getenv('SITE_URL', 'http://localhost:8001')

# Срок возврата товара в днях с даты доставки (Ф23, узел 1.14 «сколько дней»).
# Стандарт для одежды - 14 дней. Не хардкодим по месту (правило репо №1) -
# одна точка правды для модели и валидации заявки.
RETURN_PERIOD_DAYS = int(os.getenv('RETURN_PERIOD_DAYS', '14'))

# CORS: явный белый список origin фронтенда (S16).
# Запрос без Origin (curl/мобайл) проходит - CORS касается только браузерных запросов.
CORS_ALLOWED_ORIGINS = [
    o.strip() for o in os.getenv('CORS_ALLOWED_ORIGINS', '').split(',') if o.strip()
]

# Production-блок безопасности транспорта (S12).
# В DEBUG не включаем, чтобы не ломать локальную разработку по http.
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000  # 1 год
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    # За reverse-proxy (nginx) Django узнаёт о https по этому заголовку
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    # session+CSRF cookie нужны не для API (там Bearer-токен), а для
    # Django admin и DRF browsable API - отдельный от API контур
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True