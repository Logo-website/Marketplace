from datetime import datetime, time, timedelta
from decimal import Decimal

from django.db.models import Count, DecimalField, F, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.orders.models import Order, OrderItem
from apps.permissions import IsSeller
from services.clickhouse_service import get_seller_stats
from .models import Product, Review

# Дашборд продавца (Ф16, узел 2.1). Read-only витрина агрегатов поверх уже
# существующих данных: деньги - из Order/OrderItem (Postgres, источник истины),
# вовлечённость - из ClickHouse, уведомления - выводимые из БД срезы.

# Порог «заканчивается товар» (план 4.4 / этап 2). Константа, а не хардкод по
# месту: 3 шт. - на учебной витрине это «пора пополнять», но ещё не «нет в
# наличии». Различение «заканчивается» (1..3) и «нет» (0) - флагом out_of_stock.
LOW_STOCK_THRESHOLD = 3

# Дневная сетка графика для period=all непрактична (сотни столбцов), поэтому
# для 'all' дневной ряд ограничиваем последними N днями (план 4.3); сводка при
# этом считается за всё время.
ALL_CHART_DAYS = 30

VALID_PERIODS = ('today', '7d', '30d', 'all')
DEFAULT_PERIOD = '30d'

def _revenue_sum():
    """Свежее выражение «Σ цена_на_момент × количество» под каждый aggregate/
    annotate (не переиспользуем один инстанс между запросами). output_field
    обязателен: Decimal × Integer тип не выводит."""
    return Sum(
        F('price_at_purchase') * F('quantity'),
        output_field=DecimalField(max_digits=12, decimal_places=2),
    )


def _money(value):
    """Decimal -> строка с двумя знаками (контракт 4.6: денежные поля - строки)."""
    return str((value or Decimal('0')).quantize(Decimal('0.01')))


def _start_of_day(d):
    """Начало локального дня d как aware-datetime (срез today/period по TZ сервера)."""
    return timezone.make_aware(datetime.combine(d, time.min))


def _period_start(period, today):
    """Дата начала периода (включительно). 'all' -> None (без среза по дате)."""
    if period == 'today':
        return today
    if period == '7d':
        return today - timedelta(days=6)
    if period == '30d':
        return today - timedelta(days=29)
    return None  # all


class SellerDashboardView(APIView):
    """GET /api/products/dashboard/?period=today|7d|30d|all (дефолт 30d).

    Возвращает сводку (revenue/orders/avg_check/units), ряд для графика по дням
    и панель «что требует действия». Только чтение; изоляция по продавцу через
    filter(product__seller=request.user) + IsSeller (часть 9 плана).
    """
    permission_classes = [IsSeller]

    def get(self, request):
        user = request.user

        period = request.query_params.get('period', DEFAULT_PERIOD)
        if period not in VALID_PERIODS:
            period = DEFAULT_PERIOD  # фолбэк на мусор, не 500 (граничный случай §6)

        today = timezone.localdate()
        start_date = _period_start(period, today)
        since_dt = _start_of_day(start_date) if start_date else None

        # Позиции продавца в не-отменённых заказах - основа денежных метрик (4.1).
        items = OrderItem.objects.filter(product__seller=user).exclude(
            order__status=Order.STATUS_CANCELLED
        )
        if since_dt:
            items = items.filter(order__created_at__gte=since_dt)

        summary = self._summary(items)
        chart = self._chart(user, period, today)
        action_items = self._action_items(user, since_dt)
        engagement = self._engagement(user)

        return Response({
            'period': period,
            'summary': summary,
            'chart': chart,
            'action_items': action_items,
            'engagement': engagement,
        })

    def _summary(self, items):
        agg = items.aggregate(
            revenue=_revenue_sum(),
            orders=Count('order', distinct=True),
            units=Sum('quantity'),
        )
        revenue = agg['revenue'] or Decimal('0')
        orders = agg['orders'] or 0
        units = agg['units'] or 0
        # Средний чек по позициям продавца; orders==0 -> 0 (без деления на ноль).
        avg_check = revenue / orders if orders else Decimal('0')
        return {
            'revenue': _money(revenue),
            'orders': orders,
            'avg_check': _money(avg_check),
            'units': units,
        }

    def _chart(self, user, period, today):
        # Диапазон графика: для конечных периодов = сам период; для 'all' -
        # последние ALL_CHART_DAYS дней (дневная сетка на всё время непрактична).
        if period == 'today':
            chart_start = today
        elif period == '7d':
            chart_start = today - timedelta(days=6)
        elif period == '30d':
            chart_start = today - timedelta(days=29)
        else:  # all
            chart_start = today - timedelta(days=ALL_CHART_DAYS - 1)

        chart_items = OrderItem.objects.filter(
            product__seller=user,
            order__created_at__gte=_start_of_day(chart_start),
        ).exclude(order__status=Order.STATUS_CANCELLED)

        rows = (
            chart_items
            .annotate(day=TruncDate('order__created_at'))
            .values('day')
            .annotate(revenue=_revenue_sum(), orders=Count('order', distinct=True))
        )
        by_day = {r['day']: r for r in rows}

        # Достраиваем дни-нули по всему диапазону (4.3): иначе ось времени врёт -
        # TruncDate отдаёт только дни, где были заказы.
        chart = []
        d = chart_start
        while d <= today:
            row = by_day.get(d)
            chart.append({
                'date': d.isoformat(),
                'revenue': _money(row['revenue']) if row else '0.00',
                'orders': row['orders'] if row else 0,
            })
            d += timedelta(days=1)
        return chart

    def _action_items(self, user, since_dt):
        # Новые заказы: ждут действия продавца (created/paid), без среза по дате -
        # старый необработанный заказ тоже «требует действия».
        new_orders = (
            Order.objects
            .filter(
                items__product__seller=user,
                status__in=[Order.STATUS_CREATED, Order.STATUS_PAID],
            )
            .distinct()
            .count()
        )

        # Заканчивается товар: только активные (скрытый/черновик не на витрине).
        low_stock = [
            {**p, 'out_of_stock': p['stock'] == 0}
            for p in Product.objects
            .filter(seller=user, status='active', stock__lte=LOW_STOCK_THRESHOLD)
            .order_by('stock')
            .values('id', 'name', 'stock')
        ]

        # Новые отзывы на товары продавца за период. created_at теперь
        # auto_now_add (модель починена), но на случай legacy-строк с NULL
        # считаем NULL-устойчиво (план 4.4).
        reviews = Review.objects.filter(product__seller=user)
        if since_dt:
            reviews = reviews.filter(
                Q(created_at__gte=since_dt) | Q(created_at__isnull=True)
            )
        recent_reviews = reviews.count()

        # Заглушка под «прошёл модерацию» до Ф17: агрегат по статусам, не событие.
        rows = (
            Product.objects.filter(seller=user)
            .values('status')
            .annotate(c=Count('id'))
        )
        status_counts = {r['status']: r['c'] for r in rows}
        products_by_status = {
            'active': status_counts.get('active', 0),
            'moderation': status_counts.get('moderation', 0),
            'hidden': status_counts.get('hidden', 0),
        }

        return {
            'new_orders': new_orders,
            'low_stock': low_stock,
            'recent_reviews': recent_reviews,
            'products_by_status': products_by_status,
        }

    def _engagement(self, user):
        # Вовлечённость из ClickHouse (просмотры). get_seller_stats обёрнут в
        # try/except и отдаёт [] при недоступности -> деньги есть, просмотры 0.
        product_ids = list(
            Product.objects.filter(seller=user).values_list('id', flat=True)
        )
        views = 0
        for _pid, event_type, count in get_seller_stats(product_ids):
            if event_type == 'view':
                views += count
        return {'views': views}
