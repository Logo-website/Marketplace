[Русская версия](README.ru.md)

# Marketplace

A multi-vendor e-commerce platform with a Django REST API, a React storefront, and supporting services for search, analytics, email, and real-time notifications. Buyers browse products, manage a Redis-backed cart, place orders, and leave reviews; sellers manage catalog and view analytics; administrators use Django Admin.

---

## Tech stack

### Backend
| Technology | Purpose |
|---|---|
| Python 3.11 | Runtime |
| Django 5.0 | Web framework |
| Django REST Framework 3.15 | REST API |
| djangorestframework-simplejwt 5.3 | JWT auth (access + refresh, blacklist on logout) |
| PostgreSQL 16 | Primary database |
| Redis 7 | Shopping cart storage and catalog/card cache |
| Elasticsearch 8.12 | Full-text product search |
| RabbitMQ + Celery 5.3 | Async tasks: email, analytics, co-purchase matrix (with beat) |
| Kafka (kafka-python) | Order events for WebSocket service |
| ClickHouse (clickhouse-driver) | View/purchase analytics |
| Resend | OTP and transactional email |
| drf-spectacular | OpenAPI / Swagger |
| Pytest + pytest-django | API tests |

### Frontend
| Technology | Purpose |
|---|---|
| React 19 | UI |
| Vite 8 | Dev server and build |
| React Router 7 | Routing |
| Zustand 5 | Client state (auth, cart, wishlist) |
| Axios | HTTP client to `/api` |
| Tailwind CSS 4 | Styling |
| Framer Motion, Swiper | UI animations / carousel |

### Infrastructure
| Technology | Purpose |
|---|---|
| Docker Compose | Local orchestration of all backend services |
| Node.js (`node_service`) | WebSocket server consuming Kafka |
| C++ (`cpp_service`) | In-memory co-purchase recommender; loads a matrix file built from ClickHouse and **is called by the recommendations API** |

There is **no GraphQL**. Payment processing is **not implemented** (orders are created without a payment gateway).

---

## Architecture

```
┌─────────────┐     REST (JWT)      ┌──────────────────┐
│   React     │ ──────────────────► │  Django backend  │
│  (Vite)     │      /api/*         │  (DRF)           │
└─────────────┘                     └────────┬─────────┘
                                           │
         ┌─────────────────────────────────┼──────────────────────────────┐
         │                                 │                              │
         ▼                                 ▼                              ▼
   PostgreSQL                          Redis (cart)                  Elasticsearch
         │                                 │
         │                          Celery worker ◄── RabbitMQ
         │                                 │
         │                          Resend (email)
         │
         ▼
   ClickHouse (events)          Kafka ──► node_service (WebSocket :3000)
```

- **REST**: all business logic exposed under `/api/` (auth, products, orders, cart).
- **WebSocket**: `node_service` subscribes to Kafka topics `order.created` and `order.status_changed` and pushes JSON to **authenticated** clients. A client sends a JWT in the first WS message (verified with the shared `DJANGO_SECRET_KEY`, HS256); the connection is bound to a user only after the token is validated, and `user_id` is taken from the token — never from the query string. The React app connects after login and shows live order toasts.
- **Data**: persistent entities in PostgreSQL; cart in Redis; search index in Elasticsearch; analytics events in ClickHouse.

---

## Backend

Django project package: `backend/config/`. Apps: `users`, `products`, `orders`, `cart`.

### Authentication
- Email-based users (`AUTH_USER_MODEL = users.User`) with roles: `buyer`, `seller`, `admin`.
- Registration and login are **two-step OTP flows** (codes sent via Resend, stored in `OTPCode`, valid 10 minutes).
- OTP codes are generated with `secrets` (CSPRNG); the password is stored **hashed** (`make_password`) between request and verify steps, never in plaintext.
- Anti-bruteforce: `verify` endpoints are throttled per email+IP (~5/min) and the code is invalidated after 5 wrong attempts (`OTPCode.attempts`); verify consumes the code atomically (no double-use race).
- Password policy is a single source (`apps/users/validators.py`) reused by registration and reset; `AUTH_PASSWORD_VALIDATORS` enabled.
- JWT access (60 min) + refresh (7 days), rotation and blacklist enabled.
- Endpoints: register/login verify, token refresh, profile, logout (blacklist refresh), password reset (OTP).

> **Token storage (conscious tradeoff).** The frontend keeps the JWT in `localStorage` and sends it as `Authorization: Bearer`. This is vulnerable to token theft via XSS and is accepted as a study-stage simplification. CSRF does not apply to the Bearer-token API; `CSRF_COOKIE_SECURE`/`SESSION_COOKIE_SECURE` exist only for the Django admin / DRF browsable API. Migrating to an httpOnly cookie is a separate feature, not done pre-launch.

### Products
- Models: `Category`, `Product`, `ProductImage`, `Review` (one review per user per product; POST requires a prior purchase).
- Public list/detail/search; seller CRUD under `IsSeller`.
- Elasticsearch indexing on create/update/delete; search endpoint preserves ES relevance order.
- Seller analytics reads aggregated events from ClickHouse.
- Recommendations endpoint serves **item-to-item co-purchases** via the C++ service (matrix built from ClickHouse order history); without `product_id` it returns popular-by-rating. Falls back to popular-by-category when the C++ service is unavailable.

### Orders
- Models: `Order` (checkout snapshot: `recipient_name/phone/email`, `delivery_method`, `payment_method`), `OrderItem` (snapshot `product_name`, `price_at_purchase`, `size`, `color`).
- Create with line items: validates active products, stock, atomic decrement.
- Checkout from cart: `POST /api/orders/from-cart/` (optional `items` subset orders only the selected lines, the rest stay in the cart; accepts recipient fields and `delivery_method`/`payment_method`, validated against their choices — payment is a stub, no real acquiring).
- Buyer cancel: `POST /api/orders/{id}/cancel/` (`created` or `paid` only); restores stock via `Order.cancel()`.
- Seller/admin status updates with allowed transitions; cancellation restores stock. A seller may change status only for orders where **every** item is theirs; mixed-seller orders are admin-only (prevents one seller from cancelling another's items).
- Side effects (`on_order_created`): Celery email, Kafka event, ClickHouse purchase log.

### Cart
- Redis-backed (`apps/cart/cart.py`), 7-day TTL. Authenticated users only; guests keep the cart in the browser (`localStorage`).
- Composite line key `product_id|size|color` (one product in two sizes = two lines); add/set-quantity/remove/clear with stock checks.
- Merge guest cart into the server cart on login: `POST /api/cart/merge/` (sums quantities, clamps to stock, skips unavailable).

### Background tasks
- Celery tasks: order confirmation/status emails (`apps/orders/tasks.py`), Kafka order events, ClickHouse analytics (`track_event`), and the periodic co-purchase matrix rebuild (`build_copurchase_matrix`, hourly via beat). Order side effects are dispatched through `transaction.on_commit` for commit-safety.

### Key API endpoints

| Area | Method | Path | Access |
|---|---|---|---|
| Auth | POST | `/api/auth/register/` | Public — send OTP |
| Auth | POST | `/api/auth/register/verify/` | Public — create user, return JWT |
| Auth | POST | `/api/auth/login/` | Public — send OTP after password check |
| Auth | POST | `/api/auth/login/verify/` | Public — return JWT |
| Auth | POST | `/api/auth/token/refresh/` | Public |
| Auth | GET/PATCH | `/api/auth/profile/` | Authenticated |
| Auth | POST | `/api/auth/logout/` | Authenticated |
| Auth | POST | `/api/auth/password-reset/` | Public |
| Auth | POST | `/api/auth/password-reset/verify/` | Public |
| Products | GET | `/api/products/` | Public (paginated, filters; `?ids=1,2` batch by id, unpaginated — guest cart) |
| Products | GET | `/api/products/search/?q=` | Public (facets, filters, sort, did-you-mean) |
| Products | GET | `/api/products/autocomplete/?q=` | Public (lightweight suggestions) |
| Products | GET | `/api/products/categories/` | Public |
| Products | GET | `/api/products/{id}/` | Public |
| Products | GET/POST | `/api/products/{id}/reviews/` | GET public, POST authenticated + purchased |
| Products | GET | `/api/products/{id}/size-chart/` | Public (size table by category; `{group:null}` if none) |
| Products | GET/POST | `/api/products/{id}/questions/` | GET public, POST authenticated (no purchase required) |
| Products | POST | `/api/products/{id}/questions/{qid}/answers/` | Authenticated |
| Products | POST | `/api/products/answers/{aid}/helpful/` | Authenticated (toggle helpful vote) |
| Products | POST | `/api/products/create/` | Seller |
| Products | GET | `/api/products/my/` | Seller |
| Products | GET/PATCH/DELETE | `/api/products/my/{id}/` | Seller |
| Products | GET | `/api/products/analytics/` | Seller |
| Products | GET | `/api/products/recommendations/?product_id=` | Public (co-purchase via C++; `product_id` optional, falls back to popular) |
| Orders | GET/POST | `/api/orders/` | Authenticated |
| Orders | POST | `/api/orders/from-cart/` | Authenticated |
| Orders | GET | `/api/orders/{id}/` | Authenticated (own orders) |
| Orders | PATCH | `/api/orders/{id}/status/` | Seller / admin |
| Orders | POST | `/api/orders/{id}/cancel/` | Authenticated (buyer, own order) |
| Cart | GET/POST/PUT/DELETE | `/api/cart/` | Authenticated (guests use a local cart) |
| Cart | POST | `/api/cart/merge/` | Authenticated (merge guest cart on login) |
| Docs | GET | `/api/docs/` | Authenticated by default |
| Admin | — | `/admin/` | Django admin (`is_staff`) |

OpenAPI schema: `/api/schema/`.

Utility scripts (run inside backend container or local venv): `import_products.py`, `import_reviews.py` — seed catalog from CSV.

---

## Frontend

SPA in `frontend/`. Dev server proxies `/api` to `http://localhost:8001` (see `vite.config.js`).

### Routes
| Path | Page | Auth |
|---|---|---|
| `/` | Home — product list, categories, sorting | Public |
| `/search` | Search (Elasticsearch via API) | Public |
| `/products/:id` | Product detail, reviews, add to cart | Public |
| `/login`, `/register` | OTP-based auth flows | Public |
| `/forgot-password` | Password reset OTP | Public |
| `/cart` | Cart management (guest cart supported) | Public |
| `/checkout` | Checkout (`POST /orders/from-cart/`) | Private |
| `/profile` | Profile and order history | Private |
| `/seller` | Seller products and analytics | Private |
| `/wishlist` | Wishlist (localStorage only) | Private |

### State
- `authStore` — JWT in `localStorage`, profile fetch, logout with blacklist.
- `cartStore` — syncs with `/api/cart/` when authenticated, with `localStorage` (`guest_cart`) for guests; merges into the server cart on login.
- `wishlistStore` — **client-only** (`localStorage`), no backend API.

### API client
`src/api/index.js` — Axios instance with Bearer token and automatic refresh on 401.

The frontend is **not** included in `docker-compose.yml`; run it separately for local development.

---

## Project structure

```
marketplace/
├── backend/
│   ├── apps/
│   │   ├── users/          # User, OTP, auth API
│   │   ├── products/       # Catalog, search, reviews, analytics
│   │   ├── orders/         # Orders, Celery tasks
│   │   └── cart/           # Redis cart API
│   ├── config/             # settings, urls, celery, wsgi
│   ├── services/           # KafkaService, ClickHouseService (lazy clients, single layer)
│   ├── import_products.py  # CSV seed script
│   ├── import_reviews.py   # Review seed script
│   ├── requirements.txt
│   ├── Dockerfile
│   └── pytest.ini
├── frontend/               # React + Vite storefront
├── node_service/           # WebSocket + Kafka consumer
├── cpp_service/            # C++ co-purchase recommender (called by API)
├── docker-compose.yml
├── .env.example
├── README.md
└── README.ru.md
```

---

## Installation and run

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for frontend dev)
- Copy environment file: `cp .env.example .env` and fill in secrets (see table below)

### Full stack (Docker)

```bash
docker compose up --build
```

Apply migrations (first run or after model changes):

```bash
docker compose exec backend python manage.py migrate
```

| Service | URL / port |
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

The backend container runs **Gunicorn** (`config.wsgi`, 4 workers); Celery `worker` and `beat` run as separate Compose services.

### Frontend (local)

```bash
cd frontend
npm install
npm run dev
```

Default Vite URL: http://localhost:5173 (proxies API to port 8001).

### Production

The API runs under **Gunicorn** (4 workers) in Compose, and security settings are hardened under `if not DEBUG` (`SECURE_SSL_REDIRECT`, HSTS, secure cookies, `SECURE_PROXY_SSL_HEADER`); CORS uses an explicit allowlist. Still out of scope: frontend static hosting in Compose. Build the frontend with `npm run build` and deploy it separately; run the API with `DEBUG=False` and proper secrets management.

### Optional: seed data

```bash
docker compose exec backend python import_products.py
docker compose exec backend python import_reviews.py
```

---

## Environment variables

Copy from [`.env.example`](.env.example). Do not commit real secrets.

| Variable | Required | Description | Example |
|---|---|---|---|
| `DJANGO_SECRET_KEY` | Yes | Django secret, also shared with `node_service` for WS JWT validation; app fails to start if missing | `your-secret-key-here` |
| `DEBUG` | Yes | Debug mode (`True` / `False`) | `True` |
| `DJANGO_ALLOWED_HOSTS` | Yes | Comma-separated hosts | `localhost,127.0.0.1` |
| `POSTGRES_DB` | Yes | Database name | `marketplace` |
| `POSTGRES_USER` | Yes | Database user | `marketplace_user` |
| `POSTGRES_PASSWORD` | Yes | Database password | `your-password-here` |
| `POSTGRES_HOST` | Yes | DB host (`db` in Compose) | `db` |
| `POSTGRES_PORT` | Yes | DB port | `5432` |
| `REDIS_URL` | No | Cart Redis URL (default in settings) | `redis://redis:6379/0` |
| `REDIS_CACHE_URL` | No | Catalog/card cache Redis URL (separate DB from cart) | `redis://redis:6379/1` |
| `RABBITMQ_URL` | No | Celery broker | `amqp://guest:guest@rabbitmq:5672/` |
| `ELASTICSEARCH_URL` | No | Elasticsearch node | `http://elasticsearch:9200` |
| `KAFKA_BOOTSTRAP_SERVERS` | No | Kafka brokers | `kafka:9092` |
| `CLICKHOUSE_HOST` | No | ClickHouse host | `clickhouse` |
| `CLICKHOUSE_PORT` | No | ClickHouse native port | `9000` |
| `CPP_SERVICE_URL` | No | C++ co-purchase recommender URL | `http://recommender:8080/` |
| `CPP_SERVICE_TIMEOUT` | No | Recommender HTTP timeout, seconds (then fallback) | `1.5` |
| `RECOMMENDER_MATRIX_PATH` | No | Shared co-purchase matrix file (Celery writes, C++ reads) | `/data/copurchase_matrix.txt` |
| `VITE_WS_URL` | No | Frontend build-time WebSocket URL (`node_service`) | `ws://localhost:3000` |
| `RESEND_API_KEY` | Yes* | Resend API key for OTP and order emails | `re_...` |
| `DEFAULT_FROM_EMAIL` | No | Sender address (must be allowed in Resend) | `noreply@marketplace.com` |

\*Required for registration, login OTP, password reset, and order emails to work. Not listed in `.env.example` but read in `config/settings.py`.

---

## Scripts and commands

### Frontend (`frontend/package.json`)

| Script | Command | Purpose |
|---|---|---|
| `dev` | `npm run dev` | Vite dev server with HMR |
| `build` | `npm run build` | Production build to `dist/` |
| `preview` | `npm run preview` | Preview production build |
| `lint` | `npm run lint` | ESLint |
| `test` | `npm test` | Vitest (unit tests, e.g. size matching) |

### Backend

| Command | Purpose |
|---|---|
| `python manage.py migrate` | Apply database migrations |
| `python manage.py createsuperuser` | Create admin user |
| `python manage.py reindex_products` | Rebuild the Elasticsearch index (run after a mapping change) |
| `python manage.py seed_orders` | Seed order history (ClickHouse purchase events) for the co-purchase matrix |
| `python manage.py build_recommendations` | Recompute the co-purchase matrix from ClickHouse (also runs hourly via Celery beat) |
| `pytest` | Run API tests |
| `celery -A config worker --loglevel=info` | Celery worker (started via Compose as `celery` service) |
| `celery -A config beat --loglevel=info` | Celery beat scheduler (Compose `beat` service; periodic matrix rebuild) |

There is **no Makefile** in the repository.

### Docker Compose

```bash
docker compose up --build    # start all services
docker compose down          # stop
docker compose exec backend pytest   # run tests in container
```

---

## Tests

Backend tests use **pytest** with fixtures in `backend/conftest.py`.

```bash
# Inside Docker
docker compose exec backend pytest

# Local (with DB and env configured)
cd backend && pytest
```

| Module | Coverage |
|---|---|
| `apps/users/tests/test_auth.py` | Auth: two-step OTP register/login, password hashing, attempt lockout, single-use code |
| `apps/products/tests/test_products.py` | Product list/detail/create, rating denormalization, card cache, search facets and autocomplete, recommendations and fallback, seller email not exposed, size chart endpoint and category-to-group mapping, Q&A questions/answers/helpful-vote (permissions, helpful sorting, seller badge) |
| `apps/orders/tests/test_orders.py` | Order create, stock decrement, validation, buyer cancel with refund, multi-vendor status authorization, selected-subset checkout, variant snapshot |
| `apps/cart/tests.py` | Cart add/get/set-quantity/remove/clear with stock checks, inactive product, auth, variant lines, guest-cart merge (clamp/sum/skip), batch by ids |

Frontend: **Vitest** - `cd frontend && npm test`. Unit test of the pure size-matching function `src/utils/sizeMatch.test.js` (Ф5).

---

## User roles

| Role | Capabilities |
|---|---|
| **buyer** | Browse, cart, orders, reviews (after purchase), recommendations |
| **seller** | Manage own products, view analytics, update order status for own products |
| **admin** | `role=admin` syncs to `is_staff` / `is_superuser`; full order status access; Django Admin |

---

## Documentation

Interactive API docs: http://localhost:8001/api/docs/ (requires authentication unless permissions are changed).
