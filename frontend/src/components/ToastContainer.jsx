import { AnimatePresence, motion } from 'framer-motion'
import useToastStore from '../store/toastStore'
import { MOTION } from '../lib/motion'

// Тосты действий пользователя. Позиционируются сверху по центру, чтобы не
// конфликтовать с WS-тостами заказов (те - снизу справа, см. NotificationToasts).
const STYLES = {
  success: 'bg-success text-white',
  error: 'bg-danger text-white',
  info: 'bg-ink text-white',
}

export default function ToastContainer() {
  const { toasts, dismiss } = useToastStore()

  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[60] flex flex-col items-center gap-2 w-full max-w-sm px-4 pointer-events-none">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={MOTION}
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto cursor-pointer max-w-full break-words rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${STYLES[t.type] || STYLES.info}`}
          >
            {t.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
