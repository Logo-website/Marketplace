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

- **REST**: all business logic exposed under `/api/` (auth, products, orders, cart, notifications).
- **WebSocket**: `node_service` subscribes to the Kafka topic `user.notification` and pushes JSON to **authenticated** clients. A client sends a JWT in the first WS message (verified with the shared `DJANGO_SECRET_KEY`, HS256); the connection is bound to a user only after the token is validated, and the message is routed by `recipient_id` — never from the query string. The React app connects after login and shows live notification toasts and a bell feed.
- **Data**: persistent entities in PostgreSQL; cart in Redis; search index in Elasticsearch; analytics events in ClickHouse.

---

## Backend

Django project package: `backend/config/`. Apps: `users`, `products`, `orders`, `cart`, `notifications`.

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
- Seller order desk (`/api/orders/seller/`): read-only list/detail of orders containing the seller's items, showing only own items, own-items total and recipient name/address (buyer email/phone withheld). Mixed orders are read-only (`can_update_status=false`); status changes reuse the existing `PATCH /api/orders/{id}/status/`.
- Side effects (`on_order_created`): notification through the central engine (feed + one email + live WS), ClickHouse purchase log.

### Cart
- Redis-backed (`apps/cart/cart.py`), 7-day TTL. Authenticated users only; guests keep the cart in the browser (`localStorage`).
- Composite line key `product_id|size|color` (one product in two sizes = two lines); add/set-quantity/remove/clear with stock checks.
- Merge guest cart into the server cart on login: `POST /api/cart/merge/` (sums quantities, clamps to stock, skips unavailable).

### Notifications
- Central engine `notify(user, event, context)` (`apps/notifications/`): persists an on-site feed item (the bell), pushes it live over WebSocket (Kafka `user.notification`), and emails it (Resend) according to the user's `notification_prefs`.
- Categories split **transactional** (order status — always delivered, can't be disabled) from **marketing** (promos/price — opt-in, default off); one-click unsubscribe via a signed token (Django `signing`), email only to `user.email`, UGC escaped in HTML.
- Segmented broadcasts (`Broadcast`): an admin sends to a segment (all / buyers / sellers) from Django Admin; Celery fans out in batches, respecting opt-out.
- Forward hooks (registry + TODO) for events whose producers land in later phases: review/question answered, price drop/restock, brand news. SMS/push is a stub provider (no real gateway in scope).

### Background tasks
- Celery tasks: notification emails and segmented broadcast fan-out (`apps/notifications/tasks.py`), Kafka event publishing (`apps/orders/tasks.py`), ClickHouse analytics (`track_event`), and the periodic co-purchase matrix rebuild (`build_copurchase_matrix`, hourly via beat). Order side effects are dispatched through `transaction.on_commit` for commit-safety.

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
| Auth | POST | `/api/auth/password-change/` | Authenticated (old → new, no OTP) |
| Auth | POST | `/api/auth/email-change/` | Authenticated — password + OTP to new address |
| Auth | POST | `/api/auth/email-change/verify/` | Authenticated — confirm OTP, alert sent to old address |
| Auth | GET/POST | `/api/auth/addresses/` | Authenticated (own delivery addresses) |
| Auth | GET/PUT/PATCH/DELETE | `/api/auth/addresses/{id}/` | Authenticated (own; one default) |
| Auth | POST | `/api/auth/seller/onboarding/` | Authenticated (become seller; full set activates, flips role buyer → seller) |
| Auth | GET/PATCH | `/api/auth/seller/profile/` | Seller (own profile; PATCH only when active) |
| Products | GET | `/api/products/` | Public (paginated, filters; `?ids=1,2` batch by id, unpaginated — guest cart) |
| Products | GET | `/api/products/search/?q=` | Public (facets, filters, sort, did-you-mean) |
| Products | GET | `/api/products/autocomplete/?q=` | Public (lightweight suggestions) |
| Products | GET | `/api/products/categories/` | Public |
| Products | GET | `/api/products/{id}/` | Public |
| Products | GET/POST | `/api/products/{id}/reviews/` | GET public, POST authenticated + purchased |
| Products | GET | `/api/products/reviews/my/` | Authenticated (own reviews, with product info) |
| Products | POST | `/api/products/reviews/{id}/reply/` | Seller (owner of product) / admin (seller reply, shown on card) |
| Products | GET | `/api/products/{id}/size-chart/` | Public (size table by category; `{group:null}` if none) |
| Products | GET/POST | `/api/products/{id}/questions/` | GET public, POST authenticated (no purchase required) |
| Products | POST | `/api/products/{id}/questions/{qid}/answers/` | Authenticated |
| Products | POST | `/api/products/answers/{aid}/helpful/` | Authenticated (toggle helpful vote) |
| Products | POST | `/api/products/create/` | Seller |
| Products | GET | `/api/products/my/` | Seller |
| Products | GET | `/api/products/my/reviews/` | Seller (reviews on own products, `?answered=` filter) |
| Products | GET | `/api/products/my/questions/` | Seller (questions on own products, `?answered=` filter) |
| Products | GET/PATCH/DELETE | `/api/products/my/{id}/` | Seller |
| Products | GET | `/api/products/analytics/` | Seller |
| Products | GET | `/api/products/dashboard/?period=` | Seller (revenue/orders/avg check/units + sales chart + action items; `period=today\|7d\|30d\|all`) |
| Products | GET | `/api/products/recommendations/?product_id=` | Public (co-purchase via C++; `product_id` optional, falls back to popular) |
| Products | GET | `/api/products/moderation/` | Admin (moderation queue: products in `moderation`) |
| Products | POST | `/api/products/moderation/{id}/approve/` | Admin (approve → `active`, enters catalog) |
| Products | POST | `/api/products/moderation/{id}/reject/` | Admin (reject with reason → `rejected`) |
| Products | POST | `/api/products/reports/` | Authenticated (file a complaint on product/review/seller/question/answer) |
| Products | GET | `/api/products/reports/` | Admin (complaints queue, `?status=` filter) |
| Products | POST | `/api/products/reports/{id}/resolve/` | Admin (hide reported content / take down product) |
| Products | POST | `/api/products/reports/{id}/dismiss/` | Admin (dismiss complaint, target untouched) |
| Products | POST | `/api/products/reviews/{id}/hide/`, `/unhide/` | Admin (proactively hide/restore a review) |
| Products | POST | `/api/products/questions/{id}/hide/`, `/unhide/` | Admin (hide/restore a question) |
| Products | POST | `/api/products/answers/{id}/hide/`, `/unhide/` | Admin (hide/restore an answer) |
| Products | GET | `/api/products/brands/` | Public (brand index; sellers with active products, `?q=`/`?category=`/`?sort=alpha\|popular\|new`) |
| Products | GET | `/api/products/brand/{id}/` | Public (brand storefront profile; 404 if not an active seller) |
| Products | GET/POST | `/api/products/brand/{id}/reviews/` | GET public, POST authenticated + purchased (seller reviews) |
| Products | GET/POST | `/api/products/brand/{id}/follow/` | GET status (public), POST authenticated (toggle subscription, not self) |
| Orders | GET/POST | `/api/orders/` | Authenticated |
| Orders | POST | `/api/orders/from-cart/` | Authenticated (requires `accept_offer`; emits a 54-FZ receipt stub) |
| Orders | GET | `/api/orders/{id}/` | Authenticated (own orders) |
| Orders | PATCH | `/api/orders/{id}/status/` | Seller / admin |
| Orders | POST | `/api/orders/{id}/cancel/` | Authenticated (buyer, own order) |
| Orders | GET | `/api/orders/seller/` | Seller / admin (orders with own items, `?status=` filter) |
| Orders | GET | `/api/orders/seller/{id}/` | Seller / admin (own items only, 404 otherwise) |
| Returns | GET/POST | `/api/orders/returns/` | Authenticated (buyer; create only on own delivered order within return period) |
| Returns | GET | `/api/orders/returns/{id}/` | Authenticated (buyer-owner / seller-owner / admin, no counterparty PII) |
| Returns | POST | `/api/orders/returns/{id}/dispute/` | Authenticated (buyer; only `rejected` → `disputed`) |
| Returns | GET | `/api/orders/seller/returns/` | Seller / admin (returns on own items, `?status=` filter) |
| Returns | PATCH | `/api/orders/seller/returns/{id}/` | Seller / admin (status machine: approve/reject/receive/refund, own items only) |
| Cart | GET/POST/PUT/DELETE | `/api/cart/` | Authenticated (guests use a local cart) |
| Cart | POST | `/api/cart/merge/` | Authenticated (merge guest cart on login) |
| Notifications | GET | `/api/notifications/` | Authenticated (own feed, paginated) |
| Notifications | GET | `/api/notifications/unread-count/` | Authenticated |
| Notifications | POST | `/api/notifications/{id}/read/` | Authenticated (own; 404 otherwise) |
| Notifications | POST | `/api/notifications/read-all/` | Authenticated |
| Notifications | GET | `/api/notifications/unsubscribe/{token}/` | Public (signed one-click unsubscribe) |
| Chat | GET/POST | `/api/chat/conversations/` | Authenticated (own dialogs; idempotent start, `?role=buyer/seller`) |
| Chat | GET/POST | `/api/chat/conversations/{id}/messages/` | Authenticated (participant only; POST throttled) |
| Chat | POST | `/api/chat/conversations/{id}/read/` | Authenticated (participant only; marks incoming read) |
| Legal | GET | `/api/legal/documents/` | Public (published documents: offer, privacy, delivery/returns, about, contacts) |
| Legal | GET | `/api/legal/documents/{slug}/` | Public (one document by slug; draft/unknown → 404) |
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
| `/brands` | Brand catalog — index of marks, search, alphabet/category, "new brands" | Public |
| `/brand/:id` | Brand storefront — header, product lane (filters/sort), seller reviews, follow | Public |
| `/login`, `/register` | OTP-based auth flows | Public |
| `/forgot-password` | Password reset OTP | Public |
| `/cart` | Cart management (guest cart supported) | Public |
| `/checkout` | Checkout (`POST /orders/from-cart/`) | Private |
| `/profile` | Account hub (tabs: overview, orders, my data, addresses, my reviews, notifications, returns, chats; `?tab=`) | Private |
| `/chats`, `/chats/:id` | Chat — dialog list and conversation window (buyer/seller + support) | Private |
| `/help` | Help / FAQ (static accordion) | Public |
| `/legal/:slug` | Legal document (offer, privacy, delivery/returns, about, contacts) | Public |
| `/sell` | Seller onboarding (become seller; already-seller → settings) | Private |
| `/seller` | Seller products and analytics | Seller |
| `/seller/settings` | Store settings (legal data, requisites, storefront, tariff) | Seller |
| `/wishlist` | Wishlist (localStorage only) | Private |
| `/admin/moderation` | Product moderation queue (approve / reject with reason) | Admin |
| `/admin/reports` | Complaints queue and UGC moderation (hide content / dismiss) | Admin |

### State
- `authStore` — JWT in `localStorage`, profile fetch, logout with blacklist.
- `cartStore` — syncs with `/api/cart/` when authenticated, with `localStorage` (`guest_cart`) for guests; merges into the server cart on login.
- `wishlistStore` — **client-only** (`localStorage`), no backend API.
- `addressStore` — syncs delivery addresses with `/api/auth/addresses/` (server-only, no guest mode).

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
│   │   ├── cart/           # Redis cart API
│   │   └── notifications/  # Notification feed, preferences, broadcasts
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
| `SITE_URL` | No | Base URL for absolute links in emails (unsubscribe) | `http://localhost:8001` |
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
| `apps/users/tests/test_seller_onboarding.py` | Seller onboarding: full set activates and flips role, incomplete saves draft, invalid INN → 400, role flip only from buyer, INN by status, requisites not exposed, idempotency, settings PATCH (active-only, can't blank required) |
| `apps/products/tests/test_products.py` | Product list/detail/create, rating denormalization, card cache, search facets and autocomplete, recommendations and fallback, seller email not exposed, size chart endpoint and category-to-group mapping, Q&A questions/answers/helpful-vote (permissions, helpful sorting, seller badge), seller reply to reviews and feedback aggregation (ownership 403, role gate, answered filter/sort, reply shown on card), moderation (admin-only queue, approve→catalog, reject with reason, 409 on repeat, audit fields, reason cleared on resubmit, admin-actions), complaints and UGC moderation (report create with dedup/404/400, admin-only queue with PII-minimized target preview, resolve hides review and drops it from rating, dismiss, proactive hide/unhide, Q&A hide removes from public, active product take-down with ES de-index, moderation product delegates to reject, seller report not blocked) |
| `apps/orders/tests/test_orders.py` | Order create, stock decrement, validation, buyer cancel with refund, multi-vendor status authorization, selected-subset checkout, variant snapshot, checkout offer-consent guard (no `accept_offer` → 400), seller order list/detail (ownership, status filter, mixed-order read-only, buyer PII not leaked) |
| `apps/orders/tests/test_returns.py` | Returns end-to-end: create only on own delivered order within period (foreign/not-delivered/expired/duplicate/over-quantity/deleted-product rejected), multi-vendor split, no seller PII, dispute only `rejected`→`disputed` (blocked after arbitration), seller S4 isolation, status machine, idempotent stock restore on receive, full flow to refunded, photo upload |
| `apps/cart/tests.py` | Cart add/get/set-quantity/remove/clear with stock checks, inactive product, auth, variant lines, guest-cart merge (clamp/sum/skip), batch by ids |
| `apps/notifications/tests/test_notifications.py` | Notifications: `notify()` feed row, template render and UGC escaping, unknown-event safe default, transactional email always vs marketing opt-out, signed unsubscribe token (valid/forged), feed isolation (no foreign read/mark → 404), unread-count and mark-all, order create end-to-end through the center (one email, no dup), broadcast opt-out and segment filter |
| `apps/chat/tests/test_chat.py` | Chat: idempotent dialog start (seller pair / one support thread per buyer), can't chat with self, non-seller → 404, anti-IDOR (outsider can't read/post → 403/404), participant post+read, blank-message rejection, XSS body stored as plain text, no counterparty email in list, read marks incoming only, delivery recipient routing (seller thread / support buyer no recipient / bot reply to buyer), support bot reply (keyword/default/empty), send throttling |
| `apps/legal/tests/test_legal.py` | Legal docs public (5 seeded), draft/unknown slug → 404, internal field hidden, body special chars as data; 54-FZ receipt stub idempotent (one per order), checkout emits receipt visible to owner only (foreign order → 404), checkout offer-consent guard |

Frontend: **Vitest** - `cd frontend && npm test`. Unit test of the pure size-matching function `src/utils/sizeMatch.test.js` (Ф5).

---

## User roles

| Role | Capabilities |
|---|---|
| **buyer** | Browse, cart, orders, reviews (after purchase), recommendations |
| **seller** | Manage own products, view analytics, update order status for own products |
| **admin** | `role=admin` syncs to `is_staff` / `is_superuser`; full order status access; product moderation (approve/reject queue at `/admin/moderation`); complaints and UGC moderation (queue at `/admin/reports`); Django Admin |

---

## Documentation

Interactive API docs: http://localhost:8001/api/docs/ (requires authentication unless permissions are changed).
