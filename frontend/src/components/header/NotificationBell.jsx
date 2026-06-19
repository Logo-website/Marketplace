import { motion, AnimatePresence } from 'framer-motion'
import useDropdown from '../../hooks/useDropdown'

// Колокольчик уведомлений (узел 1.1) - в Ф1 это только оболочка-вход.
// Наполнение ленты, накопление непрочитанных и счётчик - Ф25; до неё дроп
// показывает пустое состояние, счётчик-заглушка (0, скрыт). Роута
// /notifications нет (переход туда упал бы в 404), поэтому ведём в дроп, а не
// на отдельную страницу. WS-тосты заказов (notificationStore) тут ни при чём.
//
// Виден только залогиненным (таблица ролей 1.1) - решение о показе принимает
// родитель (Header), здесь компонент это не проверяет повторно.
export default function NotificationBell() {
  const { open, toggle, ref } = useDropdown()
  const unread = 0 // заглушка до Ф25

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label="Уведомления"
        className="relative flex items-center justify-center w-11 h-11 rounded-xl bg-white/10 hover:bg-white/15 transition"
      >
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-black rounded-full w-5 h-5 flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50"
          >
            <div className="px-4 py-3 border-b border-gray-50">
              <p className="text-sm font-bold text-[#111]">Уведомления</p>
            </div>
            <div className="px-4 py-10 text-center">
              <div className="w-12 h-12 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-3 text-2xl">
                🔔
              </div>
              <p className="text-sm text-gray-500">Уведомлений пока нет</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
