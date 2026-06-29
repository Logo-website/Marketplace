import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { MOTION } from '../lib/motion'
import api from '../api'
import { toast } from '../store/toastStore'

// Модалка «Пожаловаться» (Ф18, узел 3.8 + «пожаловаться» из 1.5). Переиспользуется
// для товара / отзыва / вопроса / ответа: цель задаётся через targetType+targetId.
// Жалоба сама ничего не скрывает - только уходит модератору в очередь. UGC и
// комментарий выводятся как текст (React экранирует) - без dangerouslySetInnerHTML.
//
// Props:
//   targetType  - 'product' | 'review' | 'question' | 'answer' | 'seller'
//   targetId    - id цели
//   targetLabel - подпись цели для шапки («товар», «отзыв», ...)
//   isAuthenticated - гостю показываем подсказку «Войдите», а не мёртвую форму
//   onClose, onLoginRequired

// Должно совпадать с Report.REASON_CHOICES на бэке (анти-инъекция причины, §9).
const REASONS = [
  { key: 'spam', label: 'Спам' },
  { key: 'abuse', label: 'Оскорбления' },
  { key: 'fake', label: 'Фейк / накрутка' },
  { key: 'fraud', label: 'Мошенничество' },
  { key: 'forbidden', label: 'Запрещённый контент' },
  { key: 'other', label: 'Другое' },
]

const COMMENT_MAX = 2000

export default function ReportModal({ targetType, targetId, targetLabel = 'контент', isAuthenticated, onClose, onLoginRequired }) {
  const [reason, setReason] = useState('')
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // ESC закрывает, фон не скроллится, пока модалка открыта (как SizeGuideModal).
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const submit = async () => {
    if (!reason) { setError('Выберите причину'); return }
    setSubmitting(true)
    setError('')
    try {
      await api.post('/products/reports/', {
        target_type: targetType,
        target_id: targetId,
        reason,
        comment: comment.trim(),
      })
      // 201 (новая) и 200 (дубль открытой) - оба успех для пользователя.
      toast.success('Жалоба отправлена, модератор её рассмотрит')
      onClose()
    } catch (err) {
      const status = err.response?.status
      if (status === 401) {
        setError('Войдите, чтобы пожаловаться')
      } else if (status === 404) {
        setError('Объект жалобы не найден')
      } else {
        setError('Не удалось отправить жалобу')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-ink/40"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full md:max-w-md bg-card rounded-t-2xl md:rounded-2xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%', opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={MOTION}
      >
        {/* Шапка */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-line shrink-0">
          <h2 className="font-display text-lg font-bold text-ink">Пожаловаться на {targetLabel}</h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-surface transition text-ink-faint"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Тело */}
        <div className="overflow-y-auto px-5 py-5">
          {!isAuthenticated ? (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-ink-faint">Войдите, чтобы пожаловаться на {targetLabel}.</p>
              <button
                onClick={onLoginRequired}
                className="text-sm text-accent font-semibold hover:underline"
              >
                Войти →
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm font-semibold text-ink-soft mb-3">Причина жалобы</p>
              <div className="flex flex-col gap-2 mb-4">
                {REASONS.map((r) => (
                  <label
                    key={r.key}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition ${
                      reason === r.key
                        ? 'border-ink bg-surface'
                        : 'border-line-strong hover:border-line-strong'
                    }`}
                  >
                    <input
                      type="radio"
                      name="report-reason"
                      value={r.key}
                      checked={reason === r.key}
                      onChange={() => { setReason(r.key); setError('') }}
                      className="accent-ink"
                    />
                    <span className="text-sm text-ink">{r.label}</span>
                  </label>
                ))}
              </div>

              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={COMMENT_MAX}
                placeholder="Комментарий (необязательно) — что именно нарушает правила"
                rows={3}
                className="w-full border border-line-strong rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition resize-none mb-3"
              />

              {error && <p className="text-danger text-xs mb-3">{error}</p>}

              <div className="flex items-center gap-2">
                <motion.button
                  onClick={submit}
                  disabled={submitting}
                  className="bg-ink text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-ink/90 transition disabled:opacity-50"
                  whileTap={{ scale: 0.98 }}
                >
                  {submitting ? 'Отправляем…' : 'Отправить жалобу'}
                </motion.button>
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl font-semibold text-sm text-ink-faint hover:text-ink transition"
                >
                  Отмена
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
