import { motion } from 'framer-motion'

// Пустое состояние экрана: иконка в кружке + заголовок + подпись +
// необязательная кнопка действия. Используется для корзины, избранного,
// заказов, поиска - чтобы вместо «белого листа» был осмысленный экран.
//
// Props:
//   icon     - ReactNode (svg или эмодзи), показывается в сером кружке
//   title    - заголовок (обязателен)
//   subtitle - подпись под заголовком (опц.)
//   action   - { label, onClick } - кнопка-действие (опц.)
//   className - доп. классы контейнера
export default function EmptyState({ icon, title, subtitle, action, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className={`text-center py-20 bg-white rounded-2xl border border-gray-100 ${className}`}
    >
      {icon && (
        <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
          {icon}
        </div>
      )}
      <p className="text-gray-700 font-semibold mb-1">{title}</p>
      {subtitle && <p className="text-gray-400 text-sm max-w-sm mx-auto px-4">{subtitle}</p>}
      {action && (
        <motion.button
          onClick={action.onClick}
          className="mt-5 px-6 py-2.5 rounded-xl bg-[#111] text-white text-sm font-semibold hover:bg-gray-800 transition"
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {action.label}
        </motion.button>
      )}
    </motion.div>
  )
}
