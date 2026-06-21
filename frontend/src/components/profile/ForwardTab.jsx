import { motion } from 'framer-motion'

// Единая заглушка для вкладок кабинета, чьи фичи живут в будущих фазах
// (возвраты Ф23, баллы Ф27, чаты Ф24, вопросы Ф6, бренды Ф20/Ф21). Вкладка
// видна, внутри честный плейсхолдер с номером фазы - ни одной битой ссылки
// (тот же приём, что форвард-блоки Ф7). Не пять разных «скоро», а один кирпич.
//
// Props:
//   icon  - эмодзи/иконка в кружке
//   title - название раздела
//   phase - номер фазы, в которой раздел появится (например, «Ф23»)
//   description - что здесь будет
export default function ForwardTab({ icon = '🚧', title, phase, description }) {
  return (
    <motion.div
      key={title}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 py-20 text-center px-6"
    >
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">
        {icon}
      </div>
      <h2 className="text-lg font-bold text-gray-900 mb-1">{title}</h2>
      {description && (
        <p className="text-gray-400 text-sm max-w-sm mx-auto">{description}</p>
      )}
      <span className="inline-block mt-5 text-xs font-semibold text-indigo-500 bg-indigo-50 px-3 py-1.5 rounded-full">
        Появится в фазе {phase}
      </span>
    </motion.div>
  )
}
