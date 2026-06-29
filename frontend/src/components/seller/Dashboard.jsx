import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '../../lib/motion'
import api from '../../api'
import ErrorState from '../states/ErrorState'
import SalesChart from './SalesChart'
import ActionFeed from './ActionFeed'

// Дашборд продавца (Ф16, узел 2.1) - первый/дефолтный экран кабинета: денежная
// сводка за период + график продаж + панель «что требует действия». Деньги -
// честные, из заказов (бэк /products/dashboard/), а не из событий ClickHouse.
//
// Props:
//   onNavigate - (tabId) => void: переключить таб кабинета (для ActionFeed).

const PERIODS = [
  { id: 'today', label: 'Сегодня' },
  { id: '7d', label: '7 дней' },
  { id: '30d', label: '30 дней' },
  { id: 'all', label: 'Всё время' },
]

function formatRub(value) {
  return Number(value).toLocaleString('ru-RU') + ' ₽'
}

export default function Dashboard({ onNavigate }) {
  const [period, setPeriod] = useState('30d')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0) // ретрай: смена -> перезапрос

  useEffect(() => {
    let cancelled = false
    async function fetchDashboard() {
      setLoading(true)
      setError(false)
      try {
        const res = await api.get('/products/dashboard/', { params: { period } })
        if (!cancelled) setData(res.data)
      } catch {
        if (!cancelled) setError(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchDashboard()
    return () => { cancelled = true }
  }, [period, reloadKey])

  const summary = data?.summary
  const cards = [
    { label: 'Выручка', value: summary ? formatRub(summary.revenue) : '-', hint: 'до удержаний площадки' },
    { label: 'Заказов', value: summary ? summary.orders.toLocaleString('ru-RU') : '-' },
    { label: 'Средний чек', value: summary ? formatRub(summary.avg_check) : '-' },
    { label: 'Продано, шт.', value: summary ? summary.units.toLocaleString('ru-RU') : '-' },
  ]

  return (
    <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Переключатель периода */}
      <div className="flex items-center bg-card border border-line rounded-2xl p-1 gap-1 mb-6 w-fit">
        {PERIODS.map(p => (
          <button
            key={p.id}
            onClick={() => setPeriod(p.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
              period === p.id ? 'bg-ink text-white shadow-sm' : 'text-ink-faint hover:text-ink hover:bg-surface'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState title="Не удалось загрузить дашборд" onRetry={() => setReloadKey(k => k + 1)} />
      ) : loading ? (
        // Skeleton сводки + графика (состояния Ф0).
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="bg-card rounded-2xl h-28 skeleton" />)}
          </div>
          <div className="bg-card rounded-2xl h-72 skeleton" />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Карточки сводки: на мобильном 2 колонки, на десктопе 4 (адаптивность 4.2). */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...MOTION, delay: i * 0.06 }}
                className="bg-card rounded-2xl p-5 border border-line"
              >
                <p className="text-sm text-ink-faint mb-1">{c.label}</p>
                <p className="font-display text-2xl font-bold text-ink">{c.value}</p>
                {c.hint && <p className="text-[11px] text-ink-faint mt-1">{c.hint}</p>}
              </motion.div>
            ))}
          </div>

          {/* График + панель действий: на десктопе 2 колонки. */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <SalesChart data={data?.chart} />
            </div>
            <ActionFeed data={data?.action_items} onNavigate={onNavigate} />
          </div>
        </div>
      )}
    </motion.div>
  )
}
