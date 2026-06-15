import logging
import os

from celery import shared_task
from django.conf import settings

from services.clickhouse_service import write_event, get_copurchase_pairs

logger = logging.getLogger(__name__)

# Сколько сопутствующих товаров держим на один product_id в матрице.
MATRIX_TOP_N = 10


@shared_task
def track_event(event_type, user_id, product_id=0, order_id=0):
    """Асинхронная запись аналитического события в ClickHouse (S8). Вне HTTP-пути."""
    write_event(event_type, user_id, product_id, order_id)


@shared_task
def build_copurchase_matrix():
    """
    Батч-пересчёт матрицы ко-покупок (P8).

    Тяжёлая агрегация (self-join по заказам) живёт в ClickHouse, результат
    кладётся в общий файл (volume), который C++-рекомендатель грузит и держит
    в памяти. Так C++ остаётся чистым in-memory lookup без ClickHouse-драйвера.

    Формат файла - построчный, по одному товару:
        <product_id> <rec1>,<rec2>,...,<recN>
    Текстовый формат, а не JSON: парсить его в голом C++ без JSON-библиотеки
    тривиально и надёжно (см. cpp_service/main.cpp).

    Запись атомарна (во временный файл + rename), чтобы C++ не прочитал
    наполовину записанный файл.
    """
    pairs = get_copurchase_pairs()

    # pairs уже отсортированы (pid, freq DESC) - берём первые MATRIX_TOP_N на товар.
    matrix = {}
    for pid, rec, _freq in pairs:
        recs = matrix.setdefault(pid, [])
        if len(recs) < MATRIX_TOP_N:
            recs.append(rec)

    path = settings.RECOMMENDER_MATRIX_PATH
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp_path = f'{path}.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        for pid, recs in matrix.items():
            f.write(f'{pid} {",".join(str(r) for r in recs)}\n')
    os.replace(tmp_path, path)

    logger.info(f'build_copurchase_matrix: товаров в матрице {len(matrix)} -> {path}')
    return len(matrix)
