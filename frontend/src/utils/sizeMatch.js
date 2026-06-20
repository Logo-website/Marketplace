// Подбор размера по меркам тела (Ф5, узел 1.6). Чистая функция: без React и
// БЕЗ сети. Мерки тела - персональные данные, наружу не уходят: подбор считается
// на клиенте по уже полученной таблице (security-by-design, план Ф5 решение 5).
//
// Правила (план Ф5, граничные случаи):
//  - между размерами округляем ВВЕРХ (свободнее лучше, чем тесно);
//  - мерка за границами таблицы -> крайний размер с пометкой nearest=true;
//  - несколько мерок дают разные размеры -> берём БОЛЬШИЙ (консервативно),
//    помечаем, по какой оси (axis);
//  - пустой/нечисловой/отрицательный/нулевой ввод по оси игнорируется,
//    без NaN и без выдачи размера на мусоре.

// Оси подбора по группе. Роста среди них нет: reference-данных «рост -> размер»
// нет, выдумывать запрещает правило репо №1 (план Ф5, часть 7).
const GROUP_AXES = {
  top: ['chest', 'waist'],
  dress: ['chest', 'waist', 'hips'],
  bottom: ['waist', 'hips'],
  shoes: ['foot_cm'],
}

export function sizeMatch(body, chart) {
  if (!chart || !Array.isArray(chart.measurements) || chart.measurements.length === 0) {
    return null
  }
  const axes = GROUP_AXES[chart.group] || []
  const rows = chart.measurements

  let best = null // { index, nearest, axis }
  for (const axis of axes) {
    const value = Number(body?.[axis])
    // Игнорируем пустую/нечисловую/неположительную мерку - не подбираем на мусоре.
    if (!Number.isFinite(value) || value <= 0) continue

    // Строки с этой осью, по возрастанию значения мерки.
    const usable = rows
      .map((r, i) => ({ i, v: Number(r[axis]) }))
      .filter((x) => Number.isFinite(x.v))
      .sort((a, b) => a.v - b.v)
    if (usable.length === 0) continue

    const min = usable[0]
    const max = usable[usable.length - 1]
    let pickIndex
    let nearest = false
    if (value < min.v) {
      pickIndex = min.i // меньше минимума -> наименьший размер
      nearest = true
    } else if (value > max.v) {
      pickIndex = max.i // больше максимума -> наибольший размер
      nearest = true
    } else {
      // первый размер, чья мерка >= введённой = округление вверх (и точное попадание)
      pickIndex = usable.find((x) => x.v >= value).i
    }

    // Из всех осей берём БОЛЬШИЙ размер (больший индекс в восходящей таблице).
    if (best === null || pickIndex > best.index) {
      best = { index: pickIndex, nearest, axis }
    }
  }

  if (best === null) return null // ни одной валидной мерки

  const row = rows[best.index]
  const conversion = Array.isArray(chart.conversion)
    ? chart.conversion.find((c) => c.ru === row.ru) || null
    : null

  return {
    ru: row.ru,
    nearest: best.nearest,
    axis: best.axis,
    conversion, // эквиваленты EU/US/INTL для рекомендованного размера (или null)
  }
}

export { GROUP_AXES }
