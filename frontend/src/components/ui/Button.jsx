import { motion } from 'framer-motion'
import Spinner from '../states/Spinner'

// Кнопка-примитив. Закрывает повторяющийся inline-паттерн (чернильная primary
// встречается в ~58 файлах). Цвета - только токены (бренд-гайд):
//   primary - чернильная (основное действие: «В корзину», «Оформить»);
//   accent  - хвойный зелёный (редко, для брендовых акций);
//   outline / ghost - вторичные;
//   danger  - деструктив.
// Поведение/пропсы - как у обычного <button> (onClick, type, disabled...).
const VARIANTS = {
  primary: 'bg-ink text-white hover:bg-ink/90',
  accent:  'bg-accent text-white hover:bg-accent-hover',
  outline: 'bg-card text-ink border border-line hover:border-line-strong',
  ghost:   'bg-transparent text-ink hover:bg-surface',
  danger:  'bg-danger text-white hover:bg-danger/90',
}

const SIZES = {
  sm: 'px-4 py-2 text-xs',
  md: 'px-6 py-2.5 text-sm',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  children,
  ...props
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`}
      {...props}
    >
      {loading && <Spinner className="w-4 h-4" />}
      {children}
    </motion.button>
  )
}
