FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Команда запуска для Render (на free-тарифе нет Shell, поэтому migrate/collectstatic/
# createsuperuser встроены в старт). collectstatic тут, а не на этапе build: при сборке
# нет SECRET_KEY, а settings без него падает. createsuperuser идемпотентен через `|| true`
# (на повторных запусках админ уже есть). $PORT задаёт Render. Локальный docker-compose
# переопределяет CMD своей командой, поэтому на разработку это не влияет.
CMD sh -c "python manage.py migrate --noinput && python manage.py collectstatic --noinput && (python manage.py createsuperuser --noinput || true) && gunicorn config.wsgi:application --bind 0.0.0.0:$PORT --workers 2"