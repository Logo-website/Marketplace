import { motion } from 'framer-motion'

// График продаж по дням (Ф16, этап 4). Лёгкий столбчатый график на SVG/CSS,
// без chart-библиотеки (правило репо: доказать рациональность каждого куска
// стека - тяжёлая либа ради одного бар-чарта нерациональна).
//
// Ряд приходит с бэка уже с достроенными днями-нулями (план 4.3), поэтому ось
// времени равномерна: рисуем столбец на каждый элемент data как есть.
//
// Props:
//   data - [{ date: '2026-05-20', revenue: '1200.00', orders: 3 }]

function formatRub(value) {
  return Number(value).toLocaleString('ru-RU') + ' ₽'
}

// «20 мая» из ISO-даты - короткая подпись под столбцом.
function shortDay(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export default function SalesChart({ data }) {
  const points = data || []
  const revenues = points.map(p => Number(p.revenue) || 0)
  const max = Math.max(...revenues, 0)

  // Полностью пустой период (нет ни одной продажи) -> аккуратное пустое
  // состояние, не сломанная ось (план 4.4 / этап 4).
  if (points.length === 0 || max === 0) {
    return (
      <div className="bg-card rounded-2xl border border-line p-6">
        <h3 className="font-display text-sm font-semibold text-ink mb-1">Продажи по дням</h3>
        <p className="text-xs text-ink-faint mb-6">Выручка за выбранный период</p>
        <div className="h-48 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 bg-surface rounded-xl flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <p className="text-ink-faint text-sm">Продаж за этот период пока нет</p>
        </div>
      </div>
    )
  }

  // Шаг подписей: при длинном ряде (30 дней) подписываем не каждый столбец,
  // иначе оси наезжают друг на друга.
  const labelEvery = points.length > 14 ? Math.ceil(points.length / 7) : 1

  return (
    <div className="bg-card rounded-2xl border border-line p-6">
      <h3 className="font-display text-sm font-semibold text-ink mb-1">Продажи по дням</h3>
      <p className="text-xs text-ink-faint mb-6">Выручка за выбранный период</p>

      <div className="flex items-end gap-1 h-48">
        {points.map((p, i) => {
          const value = Number(p.revenue) || 0
          const heightPct = max ? (value / max) * 100 : 0
          return (
            <div key={p.date} className="flex-1 h-full flex flex-col justify-end items-center group relative">
              {/* Тултип со значением дня */}
              <div className="absolute -top-1 opacity-0 group-hover:opacity-100 transition pointer-events-none z-10 bg-ink text-white text-[10px] font-medium px-2 py-1 rounded-lg whitespace-nowrap">
                {shortDay(p.date)}: {formatRub(value)}
              </div>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${heightPct}%` }}
                transition={{ delay: i * 0.02, duration: 0.4, ease: 'easeOut' }}
                className={`w-full rounded-t-md min-h-[2px] ${value > 0 ? 'bg-accent group-hover:bg-accent-hover' : 'bg-surface'}`}
              />
            </div>
          )
        })}
      </div>

      {/* Ось дат */}
      <div className="flex gap-1 mt-2">
        {points.map((p, i) => (
          <div key={p.date} className="flex-1 text-center">
            {i % labelEvery === 0 && (
              <span className="text-[10px] text-ink-faint">{shortDay(p.date)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
