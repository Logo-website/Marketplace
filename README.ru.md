[English version](README.md)

# Marketplace

Многопользовательская торговая площадка: Django REST API, React-витрина и вспомогательные сервисы для поиска, аналитики, почты и уведомлений. Покупатели просматривают каталог, работают с корзиной в Redis, оформляют заказы и оставляют отзывы; продавцы ведут товары и смотрят аналитику; администраторы — через Django Admin.

---

## Стек технологий

### Backend
| Технология | Назначение |
|---|---|
| Python 3.11 | Среда выполнения |
| Django 5.0 | Веб-фреймворк |
| Django REST Framework 3.15 | REST API |
| djangorestframework-simplejwt 5.3 | JWT (access + refresh, blacklist при logout) |
| PostgreSQL 16 | Основная БД |
| Redis 7 | Корзина и кэш каталога/карточки |
| Elasticsearch 8.12 | Полнотекстовый поиск |
| RabbitMQ + Celery 5.3 | Фоновые задачи: email, аналитика, матрица ко-покупок (с beat) |
| Kafka (kafka-python) | События заказов для WebSocket-сервиса |
| ClickHouse (clickhouse-driver) | Аналитика просмотров и покупок |
| Resend | OTP и транзакционные письма |
| drf-spectacular | OpenAPI / Swagger |
| Pytest + pytest-django | Тесты API |

### Frontend
| Технология | Назначение |
|---|---|
| React 19 | UI |
| Vite 8 | Dev-сервер и сборка |
| React Router 7 | Маршрутизация |
| Zustand 5 | Состояние (auth, cart, wishlist) |
| Axios | HTTP-клиент к `/api` |
| Tailwind CSS 4 | Стили |
| Framer Motion, Swiper | Анимации / карусель |

### Инфраструктура
| Технология | Назначение |
|---|---|
| Docker Compose | Локальный запуск backend-сервисов |
| Node.js (`node_service`) | WebSocket + consumer Kafka |
| C++ (`cpp_service`) | In-memory рекомендатель ко-покупок; грузит файл-матрицу, собранную из ClickHouse, и **вызывается API рекомендаций** |

**GraphQL нет.** **Оплата не реализована** — заказы создаются без платёжного шлюза.

---

## Архитектура

```
┌─────────────┐     REST (JWT)      ┌──────────────────┐
│   React     │ ──────────────────► │  Django backend  │
│  (Vite)     │      /api/*         │  (DRF)           │
└─────────────┘                     └────────┬─────────┘
                                           │
         ┌─────────────────────────────────┼──────────────────────────────┐
         │                                 │                              │
         ▼                                 ▼                              ▼
   PostgreSQL                          Redis (корзина)            Elasticsearch
         │                                 │
         │                          Celery worker ◄── RabbitMQ
         │                                 │
         │                          Resend (email)
         │
         ▼
   ClickHouse (события)         Kafka ──► node_service (WebSocket :3000)
```

- **REST**: вся бизнес-логика под `/api/` (auth, products, orders, cart).
- **WebSocket**: `node_service` слушает Kafka (`order.created`, `order.status_changed`) и шлёт JSON **аутентифицированным** клиентам. Клиент присылает JWT в первом ws-сообщении (проверяется общим `DJANGO_SECRET_KEY`, HS256); соединение привязывается к пользователю только после проверки токена, а `user_id` берётся из токена — не из query-строки. React-приложение подключается после входа и показывает живые тосты о заказах.
- **Данные**: сущности в PostgreSQL; корзина в Redis; индекс поиска в Elasticsearch; события аналитики в ClickHouse.

---

## Backend

Пакет проекта: `backend/config/`. Приложения: `users`, `products`, `orders`, `cart`.

### Аутентификация
- Пользователи по email (`AUTH_USER_MODEL = users.User`), роли: `buyer`, `seller`, `admin`.
- Регистрация и вход — **двухшаговые с OTP** (коды через Resend, модель `OTPCode`, срок 10 минут).
- OTP-коды генерируются через `secrets` (CSPRNG); пароль между шагами request и verify хранится **в виде хеша** (`make_password`), не плейнтекстом.
- Анти-брутфорс: verify-эндпоинты троттлятся по email+IP (~5/мин), после 5 неверных попыток код инвалидируется (`OTPCode.attempts`); verify гасит код атомарно (без гонки double-use).
- Парольная политика в одном месте (`apps/users/validators.py`), переиспользуется при регистрации и сбросе; включены `AUTH_PASSWORD_VALIDATORS`.
- JWT: access 60 мин, refresh 7 дней, ротация и blacklist.
- Эндпоинты: verify для register/login, refresh, profile, logout, сброс пароля по OTP.

> **Хранение токена (осознанное упрощение).** Фронт держит JWT в `localStorage` и шлёт как `Authorization: Bearer`. Это уязвимо к краже токена через XSS и принято как учебное упрощение. К API с Bearer-токеном CSRF не применим; `CSRF_COOKIE_SECURE`/`SESSION_COOKIE_SECURE` нужны только для Django admin / DRF browsable API. Миграция на httpOnly-cookie — отдельная фича, на pre-launch не делается.

### Товары
- Модели: `Category`, `Product`, `ProductImage`, `Review` (один отзыв на пользователя; POST только после покупки).
- Публичный каталог и поиск; CRUD продавца под `IsSeller`.
- Индексация в Elasticsearch при create/update/delete; порядок выдачи поиска сохраняется.
- Аналитика продавца — агрегаты из ClickHouse.
- Рекомендации — **item-to-item ко-покупки** через C++-сервис (матрица собрана из истории заказов в ClickHouse); без `product_id` — популярное по рейтингу. При недоступности C++ — fallback на популярное по категории.

### Заказы
- Модели: `Order`, `OrderItem` (снимок `product_name`, `price_at_purchase`).
- Создание с позициями: проверка статуса, остатков, атомарное списание.
- Оформление из корзины: `POST /api/orders/from-cart/`.
- Отмена покупателем: `POST /api/orders/{id}/cancel/` (только `created` / `paid`); возврат остатков через `Order.cancel()`.
- Смена статуса seller/admin с допустимыми переходами; при отмене — возврат stock. Продавец меняет статус только у заказов, где **все** позиции его; смешанные заказы — только admin (чтобы продавец не отменил чужие позиции).
- Побочные эффекты (`on_order_created`): Celery email, Kafka, ClickHouse.

### Корзина
- Redis (`apps/cart/cart.py`), TTL 7 дней.
- Добавление/удаление/очистка, проверка остатка при добавлении.

### Фоновые задачи
- Celery-задачи: письма о заказе/смене статуса (`apps/orders/tasks.py`), события заказа в Kafka, аналитика в ClickHouse (`track_event`) и периодический пересчёт матрицы ко-покупок (`build_copurchase_matrix`, раз в час через beat). Побочки заказа диспатчатся через `transaction.on_commit` (commit-safety).

### Основные эндпоинты API

| Раздел | Метод | Путь | Доступ |
|---|---|---|---|
| Auth | POST | `/api/auth/register/` | Публичный — отправка OTP |
| Auth | POST | `/api/auth/register/verify/` | Публичный — создание пользователя, JWT |
| Auth | POST | `/api/auth/login/` | Публичный — OTP после проверки пароля |
| Auth | POST | `/api/auth/login/verify/` | Публичный — JWT |
| Auth | POST | `/api/auth/token/refresh/` | Публичный |
| Auth | GET/PATCH | `/api/auth/profile/` | Авторизованный |
| Auth | POST | `/api/auth/logout/` | Авторизованный |
| Auth | POST | `/api/auth/password-reset/` | Публичный |
| Auth | POST | `/api/auth/password-reset/verify/` | Публичный |
| Товары | GET | `/api/products/` | Публичный (пагинация, фильтры) |
| Товары | GET | `/api/products/search/?q=` | Публичный (фасеты, пагинация) |
| Товары | GET | `/api/products/autocomplete/?q=` | Публичный (лёгкие подсказки) |
| Товары | GET | `/api/products/categories/` | Публичный |
| Товары | GET | `/api/products/{id}/` | Публичный |
| Товары | GET/POST | `/api/products/{id}/reviews/` | GET публичный, POST после покупки |
| Товары | GET | `/api/products/{id}/size-chart/` | Публичный (таблица размеров по категории; `{group:null}`, если сетки нет) |
| Товары | POST | `/api/products/create/` | Продавец |
| Товары | GET | `/api/products/my/` | Продавец |
| Товары | GET/PATCH/DELETE | `/api/products/my/{id}/` | Продавец |
| Товары | GET | `/api/products/analytics/` | Продавец |
| Товары | GET | `/api/products/recommendations/?product_id=` | Публичный (ко-покупки через C++; `product_id` опционален, иначе популярное) |
| Заказы | GET/POST | `/api/orders/` | Авторизованный |
| Заказы | POST | `/api/orders/from-cart/` | Авторизованный |
| Заказы | GET | `/api/orders/{id}/` | Авторизованный (свои) |
| Заказы | PATCH | `/api/orders/{id}/status/` | Продавец / admin |
| Заказы | POST | `/api/orders/{id}/cancel/` | Покупатель (свой заказ) |
| Корзина | GET/POST/DELETE | `/api/cart/` | Авторизованный |
| Документация | GET | `/api/docs/` | По умолчанию нужна авторизация |
| Admin | — | `/admin/` | Django admin (`is_staff`) |

Схема OpenAPI: `/api/schema/`.

Скрипты наполнения (в контейнере backend или локальном venv): `import_products.py`, `import_reviews.py`.

---

## Frontend

SPA в `frontend/`. Dev-сервер проксирует `/api` на `http://localhost:8001` (`vite.config.js`).

### Маршруты
| Путь | Страница | Доступ |
|---|---|---|
| `/` | Главная — каталог, категории, сортировка | Публичный |
| `/search` | Поиск (Elasticsearch через API) | Публичный |
| `/products/:id` | Карточка, отзывы, в корзину | Публичный |
| `/login`, `/register` | OTP-регистрация и вход | Публичный |
| `/forgot-password` | Сброс пароля по OTP | Публичный |
| `/cart` | Корзина | Только авторизованные |
| `/checkout` | Оформление (`POST /orders/from-cart/`) | Только авторизованные |
| `/profile` | Профиль и история заказов | Только авторизованные |
| `/seller` | Товары и аналитика продавца | Только авторизованные |
| `/wishlist` | Избранное (только localStorage) | Только авторизованные |

### Состояние
- `authStore` — JWT в `localStorage`, профиль, logout с blacklist.
- `cartStore` — синхронизация с `/api/cart/`.
- `wishlistStore` — **только на клиенте** (`localStorage`), без API.

### HTTP-клиент
`src/api/index.js` — Axios с Bearer и автообновлением access при 401.

Frontend **не входит** в `docker-compose.yml` — запускается отдельно.

---

## Структура проекта

```
marketplace/
├── backend/
│   ├── apps/
│   │   ├── users/          # User, OTP, auth API
│   │   ├── products/       # Каталог, поиск, отзывы, аналитика
│   │   ├── orders/         # Заказы, Celery
│   │   └── cart/           # API корзины (Redis)
│   ├── config/             # settings, urls, celery, wsgi
│   ├── services/           # KafkaService, ClickHouseService (ленивые клиенты, единый слой)
│   ├── import_products.py  # Импорт каталога из CSV
│   ├── import_reviews.py   # Импорт отзывов
│   ├── requirements.txt
│   ├── Dockerfile
│   └── pytest.ini
├── frontend/               # React + Vite
├── node_service/           # WebSocket + Kafka
├── cpp_service/            # C++ рекомендатель ко-покупок (вызывается API)
├── docker-compose.yml
├── .env.example
├── README.md
└── README.ru.md
```

---

## Установка и запуск

### Требования
- Docker и Docker Compose
- Node.js 18+ (для frontend)
- Скопировать окружение: `cp .env.example .env` и заполнить переменные (см. таблицу)

### Весь backend-стек (Docker)

```bash
### Development (hot reload, ports exposed to localhost)
docker compose up --build
```
Override file `docker-compose.override.yml` is applied automatically.

### Production-like (gunicorn, internal ports only)
```bash
docker compose -f docker-compose.yml up --build
```

### With C++ recommender service
```bash
docker compose --profile with-recommender up --build
```


Миграции (первый запуск или после изменения моделей):

```bash
docker compose exec backend python manage.py migrate
```

| Сервис | URL / порт |
|---|---|
| API | http://localhost:8001 |
| Swagger | http://localhost:8001/api/docs/ |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |
| RabbitMQ UI | http://localhost:15672 |
| Elasticsearch | http://localhost:9200 |
| Kafka | localhost:9092 |
| ClickHouse HTTP | http://localhost:8123 |
| WebSocket | ws://localhost:3000 |

В контейнере backend запускается **Gunicorn** (`config.wsgi`, 4 воркера); Celery `worker` и `beat` — отдельные сервисы Compose.

### Frontend (локально)

```bash
cd frontend
npm install
npm run dev
```

Vite по умолчанию: http://localhost:5173 (прокси API на порт 8001).

### Production

API работает под **Gunicorn** (4 воркера) в Compose, security-настройки усилены под `if not DEBUG` (`SECURE_SSL_REDIRECT`, HSTS, secure-cookie, `SECURE_PROXY_SSL_HEADER`); CORS по явному белому списку. Вне scope осталась раздача статики frontend в Compose. Фронт собирать `npm run build` и раздавать отдельно; API запускать с `DEBUG=False` и управлением секретами.

### Опционально: тестовые данные

```bash
docker compose exec backend python import_products.py
docker compose exec backend python import_reviews.py
```

---

## Переменные окружения

Шаблон: [`.env.example`](.env.example). Реальные секреты в git не коммитить.

| Переменная | Обязательная | Назначение | Пример |
|---|---|---|---|
| `DJANGO_SECRET_KEY` | Да | Секрет Django, также общий с `node_service` для проверки JWT в WS; без него приложение не стартует | `your-secret-key-here` |
| `DEBUG` | Да | Режим отладки (`True` / `False`) | `True` |
| `DJANGO_ALLOWED_HOSTS` | Да | Хосты через запятую | `localhost,127.0.0.1` |
| `POSTGRES_DB` | Да | Имя БД | `marketplace` |
| `POSTGRES_USER` | Да | Пользователь БД | `marketplace_user` |
| `POSTGRES_PASSWORD` | Да | Пароль БД | `your-password-here` |
| `POSTGRES_HOST` | Да | Хост БД (`db` в Compose) | `db` |
| `POSTGRES_PORT` | Да | Порт БД | `5432` |
| `REDIS_URL` | Нет | Redis для корзины | `redis://redis:6379/0` |
| `REDIS_CACHE_URL` | Нет | Redis-кэш каталога/карточки (отдельная БД от корзины) | `redis://redis:6379/1` |
| `RABBITMQ_URL` | Нет | Брокер Celery | `amqp://guest:guest@rabbitmq:5672/` |
| `ELASTICSEARCH_URL` | Нет | Elasticsearch | `http://elasticsearch:9200` |
| `KAFKA_BOOTSTRAP_SERVERS` | Нет | Kafka | `kafka:9092` |
| `CLICKHOUSE_HOST` | Нет | ClickHouse | `clickhouse` |
| `CLICKHOUSE_PORT` | Нет | Порт ClickHouse | `9000` |
| `CPP_SERVICE_URL` | Нет | URL C++-рекомендатора ко-покупок | `http://recommender:8080/` |
| `CPP_SERVICE_TIMEOUT` | Нет | Таймаут HTTP к рекомендатору, сек (иначе fallback) | `1.5` |
| `RECOMMENDER_MATRIX_PATH` | Нет | Общий файл матрицы ко-покупок (Celery пишет, C++ читает) | `/data/copurchase_matrix.txt` |
| `VITE_WS_URL` | Нет | WebSocket-URL для сборки фронта (`node_service`) | `ws://localhost:3000` |
| `RESEND_API_KEY` | Да* | Resend для OTP и писем о заказах | `re_...` |
| `DEFAULT_FROM_EMAIL` | Нет | Адрес отправителя (должен быть разрешён в Resend) | `noreply@marketplace.com` |

\*Нужен для регистрации, OTP-входа, сброса пароля и писем о заказах. В `.env.example` не указан, но читается в `config/settings.py`.

---

## Скрипты и команды

### Frontend (`frontend/package.json`)

| Скрипт | Команда | Назначение |
|---|---|---|
| `dev` | `npm run dev` | Dev-сервер Vite |
| `build` | `npm run build` | Сборка в `dist/` |
| `preview` | `npm run preview` | Просмотр production-сборки |
| `lint` | `npm run lint` | ESLint |
| `test` | `npm test` | Vitest (юнит-тесты, напр. подбор размера) |

### Backend

| Команда | Назначение |
|---|---|
| `python manage.py migrate` | Миграции БД |
| `python manage.py createsuperuser` | Создать admin |
| `python manage.py reindex_products` | Пересобрать индекс Elasticsearch (после смены маппинга) |
| `python manage.py seed_orders` | Сид истории заказов (purchase-события в ClickHouse) для матрицы ко-покупок |
| `python manage.py build_recommendations` | Пересчитать матрицу ко-покупок из ClickHouse (раз в час и через Celery beat) |
| `pytest` | Тесты API |
| `celery -A config worker --loglevel=info` | Worker (в Compose — сервис `celery`) |
| `celery -A config beat --loglevel=info` | Планировщик Celery beat (сервис `beat`; периодический пересчёт матрицы) |

**Makefile в репозитории нет.**

### Docker Compose

```bash
docker compose up --build    # запуск
docker compose down          # остановка
docker compose exec backend pytest   # тесты в контейнере
```

---

## Тесты

Backend: **pytest**, фикстуры в `backend/conftest.py`.

```bash
docker compose exec backend pytest
```

| Модуль | Что покрыто |
|---|---|
| `apps/users/tests/test_auth.py` | Auth: двухшаговый OTP register/login, хеширование пароля, блокировка после неверных попыток, одноразовость кода |
| `apps/products/tests/test_products.py` | Список/карточка/создание, денормализация рейтинга, кэш карточки, фасеты поиска и автокомплит, рекомендации и fallback, email продавца не раскрыт, эндпоинт размерной сетки и маппинг категория-группа |
| `apps/orders/tests/test_orders.py` | Создание заказа, списание stock, валидация, отмена покупателем с возвратом, авторизация статуса в мультивендоре |
| `apps/cart/tests.py` | Добавление/получение/удаление/очистка с проверкой остатков, неактивный товар, авторизация |

Frontend: **Vitest** - `cd frontend && npm test`. Юнит-тест чистой функции подбора размера `src/utils/sizeMatch.test.js` (Ф5).

---

## Роли пользователей

| Роль | Возможности |
|---|---|
| **buyer** | Каталог, корзина, заказы, отзывы после покупки, рекомендации |
| **seller** | Свои товары, аналитика, смена статуса заказов с своими товарами |
| **admin** | `role=admin` → `is_staff` / `is_superuser`; все заказы; Django Admin |

---

## Документация API

Swagger UI: http://localhost:8001/api/docs/ (по умолчанию требуется авторизация).
