# 🛒 Marketplace — Многопользовательский маркетплейс

Учебно-портфолийный backend-проект. Полноценная торговая платформа с несколькими продавцами, поиском, аналитикой и уведомлениями в реальном времени.

---

## 🚀 Быстрый старт

```bash
git clone https://github.com/YOUR_USERNAME/marketplace.git
cd marketplace
cp .env.example .env
docker-compose up --build
```

API доступно на `http://localhost:8001`  
Документация: `http://localhost:8001/api/docs/`

---

## 🏗 Архитектура

Проект построен на микросервисном подходе. Каждый компонент запускается в отдельном Docker-контейнере.

```
marketplace/
├── backend/          # Django REST API (Python 3.11)
├── node_service/     # WebSocket сервер (Node.js)
├── cpp_service/      # Сервис рекомендаций (C++20)
├── docker-compose.yml
└── .env
```

---

## 🧰 Технологический стек

| Технология | Роль |
|---|---|
| Python 3.11 + Django + DRF | Основной backend API |
| PostgreSQL 16 | Основная база данных |
| Redis 7 | Корзина покупателя, кэш, сессии |
| Elasticsearch 8 | Полнотекстовый поиск по товарам |
| RabbitMQ + Celery | Фоновые задачи (email уведомления) |
| Kafka | Шина событий между сервисами |
| ClickHouse | Аналитика поведения пользователей |
| Node.js | Real-time уведомления через WebSocket |
| C++20 | Микросервис рекомендаций |
| Docker + Compose | Контейнеризация всех сервисов |
| JWT (SimpleJWT) | Авторизация |
| Pytest | Тесты |
| Swagger (drf-spectacular) | Документация API |

---

## 📡 API Эндпоинты

### Авторизация
| Метод | URL | Описание |
|---|---|---|
| POST | `/api/auth/register/` | Регистрация |
| POST | `/api/auth/login/` | Вход, получение JWT токенов |
| POST | `/api/auth/token/refresh/` | Обновление токена |
| GET/PUT | `/api/auth/profile/` | Профиль пользователя |

### Товары
| Метод | URL | Описание |
|---|---|---|
| GET | `/api/products/` | Список активных товаров |
| GET | `/api/products/search/?q=запрос` | Поиск через Elasticsearch |
| GET | `/api/products/{id}/` | Карточка товара |
| POST | `/api/products/create/` | Создание товара (продавец) |
| GET | `/api/products/my/` | Мои товары (продавец) |
| GET | `/api/products/analytics/` | Аналитика продавца |
| GET | `/api/products/recommendations/` | Рекомендации для пользователя |
| GET | `/api/products/categories/` | Список категорий |

### Заказы
| Метод | URL | Описание |
|---|---|---|
| GET/POST | `/api/orders/` | Список заказов / Создание заказа |
| GET | `/api/orders/{id}/` | Детали заказа |

### Корзина
| Метод | URL | Описание |
|---|---|---|
| GET | `/api/cart/` | Содержимое корзины |
| POST | `/api/cart/` | Добавить товар |
| DELETE | `/api/cart/` | Удалить товар / очистить |

---

## 🔄 Поток данных

**При оформлении заказа:**
1. Покупатель отправляет POST `/api/orders/`
2. Django создаёт заказ в PostgreSQL
3. Celery отправляет email через RabbitMQ
4. Kafka публикует событие `order.created`
5. Node.js читает Kafka → отправляет WebSocket уведомление покупателю
6. ClickHouse записывает событие покупки для аналитики

**При поиске товара:**
1. Запрос приходит на `/api/products/search/?q=...`
2. Django обращается к Elasticsearch
3. Elasticsearch возвращает релевантные результаты с поддержкой опечаток

---

## 🐳 Сервисы Docker

```bash
docker-compose up        # запустить всё
docker-compose up --build  # пересобрать и запустить
docker-compose down      # остановить
```

| Сервис | Порт |
|---|---|
| backend (Django) | 8001 |
| db (PostgreSQL) | 5432 |
| redis | 6379 |
| rabbitmq | 5672 / 15672 (UI) |
| elasticsearch | 9200 |
| kafka | 9092 |
| clickhouse | 8123 / 9000 |
| ws (Node.js WebSocket) | 3000 |
| recommender (C++) | 8080 |

---

## 🧪 Тесты

```bash
docker-compose exec backend pytest
```

Покрыты: регистрация, авторизация, профиль, CRUD товаров.

---

## 📄 Документация

Swagger UI доступен после запуска: `http://localhost:8001/api/docs/`

---

## 👤 Роли пользователей

- **Покупатель** — поиск, корзина, заказы, рекомендации
- **Продавец** — управление товарами, аналитика продаж
- **Администратор** — полный доступ через `/admin/`

---

## ⚙️ Переменные окружения

Создай `.env` на основе `.env.example`:

```env
DJANGO_SECRET_KEY=your-secret-key
DEBUG=True
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1

POSTGRES_DB=marketplace
POSTGRES_USER=marketplace_user
POSTGRES_PASSWORD=marketplace_pass
POSTGRES_HOST=db
POSTGRES_PORT=5432

REDIS_URL=redis://redis:6379/0
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672/
ELASTICSEARCH_URL=http://elasticsearch:9200
KAFKA_BOOTSTRAP_SERVERS=kafka:9092
CLICKHOUSE_HOST=clickhouse
CLICKHOUSE_PORT=9000
```