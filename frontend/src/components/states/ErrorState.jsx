import { motion } from 'framer-motion'
import { MOTION } from '../../lib/motion'
import Button from '../ui/Button'

// Состояние ошибки: показывается, когда запрос упал (нет сети, 5xx, таймаут).
// Отличается от пустого состояния тем, что предлагает повторить - кнопка
// «Попробовать снова» вызывает onRetry. Это закрывает главную дыру Ф0:
// раньше ошибка сети молча превращалась в «ничего не найдено».
//
// Props:
//   title    - заголовок (по умолчанию «Что-то пошло не так»)
//   subtitle - подпись (опц.)
//   onRetry  - колбэк кнопки (опц.: нет - нет кнопки)
//   retryLabel - подпись кнопки (по умолчанию «Попробовать снова»)
//   className - доп. классы контейнера
export default function ErrorState({
  title = 'Что-то пошло не так',
  subtitle = 'Не удалось загрузить данные. Проверьте соединение и попробуйте снова.',
  onRetry,
  retryLabel = 'Попробовать снова',
  className = '',
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={MOTION}
      className={`text-center py-20 bg-card rounded-2xl border border-line ${className}`}
    >
      <div className="w-16 h-16 bg-danger/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
        </svg>
      </div>
      <p className="text-ink font-semibold mb-1">{title}</p>
      {subtitle && <p className="text-ink-faint text-sm max-w-sm mx-auto px-4">{subtitle}</p>}
      {onRetry && (
        <Button onClick={onRetry} className="mt-5">
          {retryLabel}
        </Button>
      )}
    </motion.div>
  )
}
