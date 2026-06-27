import { motion } from 'framer-motion'
import { MOTION } from '../../lib/motion'
import Button from '../ui/Button'

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
      transition={MOTION}
      className={`text-center py-20 bg-card rounded-2xl border border-line ${className}`}
    >
      {icon && (
        <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
          {icon}
        </div>
      )}
      <p className="text-ink font-semibold mb-1">{title}</p>
      {subtitle && <p className="text-ink-faint text-sm max-w-sm mx-auto px-4">{subtitle}</p>}
      {action && (
        <Button onClick={action.onClick} className="mt-5">
          {action.label}
        </Button>
      )}
    </motion.div>
  )
}
