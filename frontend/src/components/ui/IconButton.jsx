import { motion } from 'framer-motion'

// Круглая кнопка-иконка (действия в шапке, на карточке, в галерее). Цвета - токены.
// На наведении уходит в бренд-зелёный (бренд-гайд §1: hover у иконок-действий).
//   label - обязателен для доступности (aria-label), т.к. внутри только иконка.
export default function IconButton({ label, className = '', children, ...props }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      whileTap={{ scale: 0.9 }}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-ink-soft hover:text-accent hover:bg-surface transition-colors ${className}`}
      {...props}
    >
      {children}
    </motion.button>
  )
}
