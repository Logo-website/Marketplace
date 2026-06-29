import { motion } from 'framer-motion'
import Icon from '../ui/Icon'

// Единая заглушка для вкладок кабинета, чьи фичи живут в будущих фазах
// (возвраты Ф23, баллы Ф27, чаты Ф24, вопросы Ф6, бренды Ф20/Ф21). Вкладка
// видна, внутри честный плейсхолдер с номером фазы - ни одной битой ссылки
// (тот же приём, что форвард-блоки Ф7). Не пять разных «скоро», а один кирпич.
//
// Props:
//   icon  - штриховая иконка в кружке (ReactNode)
//   title - название раздела
//   phase - номер фазы, в которой раздел появится (например, «Ф23»)
//   description - что здесь будет
export default function ForwardTab({ icon = <Icon name="wrench" className="w-7 h-7" />, title, phase, description }) {
  return (
    <motion.div
      key={title}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl border border-line py-20 text-center px-6"
    >
      <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4 text-ink-faint">
        {icon}
      </div>
      <h2 className="font-display text-lg font-bold text-ink mb-1">{title}</h2>
      {description && (
        <p className="text-ink-faint text-sm max-w-sm mx-auto">{description}</p>
      )}
      <span className="inline-block mt-5 text-xs font-semibold text-accent bg-accent-soft px-3 py-1.5 rounded-full">
        Появится в фазе {phase}
      </span>
    </motion.div>
  )
}
