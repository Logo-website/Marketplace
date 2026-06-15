"""
Трекер известных багов (P4): фиксируем их как xfail, а НЕ как "правильное" поведение.
Каждый тест помечен strict=True - когда баг починят (P8), тест станет xpass -> упадёт,
что заставит снять маркер и подтвердить фикс. Так баг не замораживается тестом.
"""
import inspect
import pytest


def test_log_purchase_records_order_id():
    # P8: log_purchase теперь принимает order_id (раньше всегда писался 0,
    # ко-покупки посчитать было нельзя). Был xfail - стал обычным тестом.
    from services.clickhouse_service import ClickHouseService
    sig = inspect.signature(ClickHouseService.log_purchase)
    assert 'order_id' in sig.parameters


def test_recommendations_not_random():
    # P8: RecommendationsView больше не отдаёт order_by('?') (100 случайных) -
    # ко-покупки из C++ + неслучайный fallback по рейтингу. Был xfail - стал обычным.
    from apps.products.views import RecommendationsView
    src = inspect.getsource(RecommendationsView)
    assert "order_by('?')" not in src and 'order_by("?")' not in src
