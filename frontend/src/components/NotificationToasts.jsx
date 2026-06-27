import { AnimatePresence, motion } from 'framer-motion'
import useNotificationStore from '../store/notificationStore'
import { MOTION } from '../lib/motion'

// Живые уведомления о заказах, приходящие по WebSocket.
export default function NotificationToasts() {
  const { notifications, dismiss } = useNotificationStore()

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      <AnimatePresence>
        {notifications.map((n) => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            transition={MOTION}
            onClick={() => dismiss(n.id)}
            className="cursor-pointer rounded-lg bg-ink px-4 py-3 text-sm text-white shadow-lg"
          >
            {n.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
