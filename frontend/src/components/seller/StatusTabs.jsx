import { motion } from 'framer-motion'

// Вкладки-фильтр по статусу реестра продавца (Ф13, узел 2.2). Счётчики берём
// из counts ответа списка (план 5.1). «Скрытые» - осознанное расширение поверх
// буквы карты: статус и действие «скрыть» есть, без вкладки скрытым негде
// показаться (план 5.4).
const TABS = [
  { id: 'all', label: 'Все' },
  { id: 'active', label: 'Активные' },
  { id: 'moderation', label: 'На модерации' },
  { id: 'hidden', label: 'Скрытые' },
  { id: 'rejected', label: 'Отклонённые' },
  { id: 'draft', label: 'Черновики' },
]

export default function StatusTabs({ active, counts, onChange }) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-5">
      {TABS.map((tab) => {
        const count = tab.id === 'all' ? counts?.all : counts?.[tab.id]
        const isActive = active === tab.id
        return (
          <motion.button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
              isActive
                ? 'bg-ink text-white shadow-sm'
                : 'bg-card text-ink-faint hover:text-ink border border-line'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {tab.label}
            {count != null && (
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                isActive ? 'bg-white/20 text-white' : 'bg-surface text-ink-faint'
              }`}>
                {count}
              </span>
            )}
          </motion.button>
        )
      })}
    </div>
  )
}
