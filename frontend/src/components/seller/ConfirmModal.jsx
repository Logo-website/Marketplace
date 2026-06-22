import { useEffect } from 'react'
import { motion } from 'framer-motion'

// Модалка подтверждения деструктивного действия (Ф13: удаление товара).
// Заменяет нативный confirm() (правило карты: показывать, что удаляется).
// ESC и клик по фону = отмена; блокировка скролла фона на время показа.
//
// Props:
//   title       - заголовок (обязателен)
//   message     - текст-предупреждение (опц.)
//   confirmLabel - подпись кнопки действия (по умолчанию «Удалить»)
//   loadingLabel - подпись кнопки во время запроса (по умолчанию «Удаление…»)
//   onConfirm   - колбэк подтверждения
//   onCancel    - колбэк отмены/закрытия
//   loading     - блокирует кнопки на время запроса
export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Удалить',
  loadingLabel = 'Удаление…',
  onConfirm,
  onCancel,
  loading = false,
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !loading) onCancel() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onCancel, loading])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4"
      onClick={() => !loading && onCancel()}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl p-6"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%', opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        <h2 className="text-lg font-black text-gray-900 mb-1">{title}</h2>
        {message && <p className="text-sm text-gray-500 mb-5">{message}</p>}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-gray-600 border border-gray-200 hover:bg-gray-50 transition disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition disabled:opacity-50"
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
