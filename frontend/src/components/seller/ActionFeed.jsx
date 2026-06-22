import { motion } from 'framer-motion'

// Панель «что требует действия» (Ф16, этап 4). Сигналы выводятся из БД срезов
// (план 4.4), каждый кликабелен и ведёт в соответствующий таб кабинета:
//   новые заказы      -> таб «Заказы» (Ф14)
//   заканчивается     -> таб «Товары» (Ф13)
//   новые отзывы      -> таб «Отзывы и вопросы» (Ф15)
// «Прошёл модерацию» до Ф17 - это агрегат products_by_status (на модерации N),
// не событие; Q&A-сигнал - forward Ф6 (здесь не показываем).
//
// Props:
//   data        - action_items из ответа /products/dashboard/
//   onNavigate  - (tabId) => void: переключить таб кабинета

function Row({ icon, tone, title, subtitle, onClick }) {
  const tones = {
    indigo: 'bg-indigo-50 text-indigo-600',
    amber: 'bg-amber-50 text-amber-600',
    emerald: 'bg-emerald-50 text-emerald-600',
  }
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition text-left"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        {subtitle && <p className="text-xs text-gray-400 truncate">{subtitle}</p>}
      </div>
      <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}

export default function ActionFeed({ data, onNavigate }) {
  const ai = data || {}
  const lowStock = ai.low_stock || []
  const onModeration = ai.products_by_status?.moderation || 0

  const rows = []

  if (ai.new_orders > 0) {
    rows.push(
      <Row
        key="orders"
        tone="indigo"
        title={`Новых заказов: ${ai.new_orders}`}
        subtitle="Ждут обработки - собрать и отправить"
        onClick={() => onNavigate('orders')}
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        }
      />
    )
  }

  if (lowStock.length > 0) {
    // Имена рендерим как текст (React экранирует) - XSS по UGC исключён (часть 9).
    const names = lowStock.slice(0, 3).map(p => p.name).join(', ')
    rows.push(
      <Row
        key="stock"
        tone="amber"
        title={`Заканчивается товар: ${lowStock.length}`}
        subtitle={names}
        onClick={() => onNavigate('products')}
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5 19h14a2 2 0 001.84-2.75L13.74 4a2 2 0 00-3.48 0L3.16 16.25A2 2 0 005 19z" />
          </svg>
        }
      />
    )
  }

  if (ai.recent_reviews > 0) {
    rows.push(
      <Row
        key="reviews"
        tone="emerald"
        title={`Новых отзывов: ${ai.recent_reviews}`}
        subtitle="Ответьте покупателям на отзывы"
        onClick={() => onNavigate('feedback')}
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
        }
      />
    )
  }

  if (onModeration > 0) {
    rows.push(
      <Row
        key="moderation"
        tone="indigo"
        title={`На модерации: ${onModeration}`}
        subtitle="Товары ждут проверки перед витриной"
        onClick={() => onNavigate('products')}
        icon={
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      />
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">Что требует действия</h3>
      <p className="text-xs text-gray-400 mb-4">Сигналы по вашему магазину</p>

      {rows.length === 0 ? (
        // Пустая панель -> «всё под контролем», не пустой блок (план этап 4).
        <div className="flex flex-col items-center justify-center text-center py-8">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-gray-700">Всё под контролем</p>
          <p className="text-xs text-gray-400 mt-0.5">Нет задач, требующих внимания</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col gap-1">
          {rows}
        </motion.div>
      )}
    </div>
  )
}
