import { motion } from 'framer-motion'

// «Возможно, вы искали» (Ф3, решение 4). Рендерится ТОЛЬКО при наличии
// исправления (suggestion) - не мусорим, когда запрос точный. Презентационный:
// клик зовёт onSelect(suggestion), источник истины (q в URL) меняется сверху.
export default function DidYouMean({ suggestion, onSelect }) {
  if (!suggestion) return null
  return (
    <motion.p
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-sm text-ink-soft"
    >
      Возможно, вы искали:{' '}
      <button
        onClick={() => onSelect(suggestion)}
        className="text-accent font-semibold hover:underline"
      >
        {suggestion}
      </button>
    </motion.p>
  )
}
