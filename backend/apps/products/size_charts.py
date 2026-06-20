"""Системный справочник размеров (Ф5, узел 1.6).

Reference-данные: соответствие мерок тела размеру и конвертация RU/EU/US/INTL.
Это опубликованные отраслевые стандарты, единые по всей площадке, а НЕ
бизнес-динамика (правило репо №1 - про меняющиеся цены/даты/ID, не про
фиксированные размерные стандарты). Числа взяты из опубликованной таблицы,
не выдуманы.

Источник:
- Одежда: общероссийская женская размерная сетка (RU = обхват груди / 2;
  EU = RU - 6; талия ≈ грудь - 18; бёдра ≈ грудь + 6).
- Обувь: стандартная женская обувная шкала (RU = EU; длина стопы в см).

Группировка - по типу одежды (верх / низ / платья / обувь), unisex по группе.
Гендерные таблицы (муж/жен раздельно) - будущее (Ф12/Ф19), данных о поле нет;
не имитируем пол на пустых данных (правило репо №1).

Кэш-замечание (Ф5, граничные случаи): ответ size-chart кэшируется по товару.
Деплой кода НЕ чистит redis сам по себе - после правки этого модуля (таблиц
или маппинга групп) закэшированные ответы живут до истечения TTL. Для
reference-данных это терпимо (TTL - верхняя граница расхождения), но при
срочной правке сбросить кэш size-chart вручную, как у категорий-справочника.
"""

# Базовая женская сетка одежды: (ru, eu, us, intl, chest, waist, hips) в см.
_WOMEN_CLOTHING = [
    ('40', '34', '2',  'XS', 80,  62,  86),
    ('42', '36', '4',  'S',  84,  66,  90),
    ('44', '38', '6',  'S',  88,  70,  94),
    ('46', '40', '8',  'M',  92,  74,  98),
    ('48', '42', '10', 'L',  96,  78,  102),
    ('50', '44', '12', 'L',  100, 82,  106),
    ('52', '46', '14', 'XL', 104, 86,  110),
]

# Женская обувь: (ru/eu, us, длина стопы в см). RU и EU для обуви совпадают.
_WOMEN_SHOES = [
    ('35', '5',   22.5),
    ('36', '6',   23.0),
    ('37', '6.5', 23.5),
    ('38', '7.5', 24.0),
    ('39', '8',   24.5),
    ('40', '9',   25.0),
    ('41', '9.5', 25.5),
    ('42', '10',  26.0),
]

# Метки осей мерок (для каждой группы своя). foot_cm - у обуви, обхваты - у одежды.
_CLOTHING_VALUES = {
    ru: {'chest': chest, 'waist': waist, 'hips': hips}
    for ru, _eu, _us, _intl, chest, waist, hips in _WOMEN_CLOTHING
}


def _clothing_measurements(axes):
    """Мерки одежды только по осям группы (верх - грудь/талия, низ - талия/бёдра)."""
    rows = []
    for ru, *_rest in _WOMEN_CLOTHING:
        row = {'ru': ru}
        for axis in axes:
            row[axis] = _CLOTHING_VALUES[ru][axis]
        rows.append(row)
    return rows


# Конвертация одежды. INTL (S/M/L) применима к верху и платьям; у низа -
# только RU/EU/US (узкие/инчевые размеры низа в S/M/L не маппятся однозначно).
_CLOTHING_CONVERSION = [
    {'ru': ru, 'eu': eu, 'us': us, 'intl': intl}
    for ru, eu, us, intl, *_ in _WOMEN_CLOTHING
]
_CLOTHING_CONVERSION_NO_INTL = [
    {'ru': ru, 'eu': eu, 'us': us}
    for ru, eu, us, *_ in _WOMEN_CLOTHING
]

_SHOES_MEASUREMENTS = [
    {'ru': ru, 'foot_cm': foot} for ru, _us, foot in _WOMEN_SHOES
]
# У обуви INTL нет - размер задаётся числом RU/EU.
_SHOES_CONVERSION = [
    {'ru': ru, 'eu': ru, 'us': us} for ru, us, _foot in _WOMEN_SHOES
]


SIZE_CHARTS = {
    'top': {
        'measurements': _clothing_measurements(['chest', 'waist']),
        'conversion': _CLOTHING_CONVERSION,
    },
    'bottom': {
        'measurements': _clothing_measurements(['waist', 'hips']),
        'conversion': _CLOTHING_CONVERSION_NO_INTL,
    },
    'dress': {
        'measurements': _clothing_measurements(['chest', 'waist', 'hips']),
        'conversion': _CLOTHING_CONVERSION,
    },
    'shoes': {
        'measurements': _SHOES_MEASUREMENTS,
        'conversion': _SHOES_CONVERSION,
    },
}


# Полный маппинг сид-категорий (точное имя) -> группа размеров. None = сетки нет.
# Покрывает ВСЕ ~20 категорий сида по точному имени (план Ф5, часть 4, решение 3),
# а не «прочее -> null»: иначе одежда со своими размерами (спорт/костюмы/
# домашняя/купальники/комбинезоны) молча упала бы в null. Это единственный
# источник классификации одежды по размерной группе - будущие фазы читают его,
# а не выводят группу заново из имени.
CATEGORY_SIZE_GROUP = {
    'Платья': 'dress',
    'Комбинезоны': 'dress',          # вся фигура, ближе всего к платью
    'Джинсы': 'bottom',
    'Брюки': 'bottom',
    'Шорты': 'bottom',
    'Футболки и блузки': 'top',
    'Рубашки': 'top',
    'Толстовки': 'top',
    'Куртки и пальто': 'top',        # точное имя - не «Куртки»
    'Костюмы': 'top',                # размер по обхвату груди
    'Домашняя одежда': 'top',
    'Спортивная одежда': 'top',      # приближение: спорт-верх по S/M/L
    'Купальники': 'top',             # обхват груди/бёдер; приближение
    'Кроссовки': 'shoes',
    'Обувь': 'shoes',
    'Нижнее бельё': None,            # своя система (чашки) - вне Ф5
    'Носки': None,
    'Аксессуары': None,
    'Сумки': None,
    'Другое': None,
}


def size_group_for_category(category):
    """Группа размеров для категории товара.

    None, если категории нет, её имя не в маппинге, или у категории нет
    размерной сетки (аксессуары/носки/бельё/сумки/прочее).
    """
    if category is None:
        return None
    return CATEGORY_SIZE_GROUP.get(category.name)


def get_size_chart(category):
    """Таблица размеров (мерки + конвертация) для категории товара или None.

    None для категорий без сетки - фронт отличает «нет сетки» от ошибки сети.
    """
    group = size_group_for_category(category)
    if group is None:
        return None
    chart = SIZE_CHARTS.get(group)
    if chart is None:
        return None
    return {
        'group': group,
        'measurements': chart['measurements'],
        'conversion': chart['conversion'],
    }
