import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { MOTION_FAST } from '../../lib/motion'
import useDropdown from '../../hooks/useDropdown'
import useNotificationStore from '../../store/notificationStore'

// Колокольчик уведомлений (узел 1.1 / forward Ф1, наполнение Ф25). Счётчик
// непрочитанных - live по WS (user.notification), лента тянется при открытии.
// Виден только залогиненным - решение о показе принимает родитель (Header).
export default function NotificationBell() {
  const { open, toggle, setOpen, ref } = useDropdown()
  const { feed, unread, fetchFeed, markRead, markAllRead } = useNotificationStore()
  const navigate = useNavigate()

  // Тянем ленту при открытии дропа (не на каждый рендер).
  useEffect(() => {
    if (open) fetchFeed()
    // fetchFeed стабилен (zustand) - в deps не нужен.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const handleClick = (n) => {
    if (!n.is_read) markRead(n.id)
    setOpen(false)
    if (n.link) navigate(n.link)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label="Уведомления"
        className="relative flex items-center justify-center w-10 h-10 rounded-full text-ink-soft hover:text-accent hover:bg-surface transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-accent text-white text-xs font-black rounded-full min-w-5 h-5 px-1 flex items-center justify-center">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={MOTION_FAST}
            className="absolute top-full right-0 mt-2 w-80 max-w-[90vw] bg-card rounded-2xl shadow-lift border border-line overflow-hidden z-50"
          >
            <div className="px-4 py-3 border-b border-line flex items-center justify-between">
              <p className="text-sm font-bold text-ink">Уведомления</p>
              {feed.some((n) => !n.is_read) && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-ink-faint hover:text-ink transition-colors"
                >
                  Прочитать всё
                </button>
              )}
            </div>

            {feed.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <div className="w-12 h-12 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-3 text-ink-faint">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </div>
                <p className="text-sm text-ink-soft">Уведомлений пока нет</p>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto divide-y divide-line">
                {feed.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => handleClick(n)}
                    className={`w-full text-left px-4 py-3 hover:bg-surface transition-colors flex gap-3 ${n.is_read ? '' : 'bg-accent-soft/50'}`}
                  >
                    {!n.is_read && <span className="mt-1.5 w-2 h-2 rounded-full bg-accent shrink-0" />}
                    <div className={`flex-1 min-w-0 ${n.is_read ? 'pl-5' : ''}`}>
                      <p className="text-sm font-semibold text-ink line-clamp-1">{n.title}</p>
                      {n.body && <p className="text-xs text-ink-soft line-clamp-2">{n.body}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
