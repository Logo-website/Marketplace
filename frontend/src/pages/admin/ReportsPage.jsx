import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../../api'
import { toast } from '../../store/toastStore'
import ErrorState from '../../components/states/ErrorState'
import EmptyState from '../../components/states/EmptyState'
import Icon from '../../components/ui/Icon'

// Очередь жалоб (Ф18, узел 3.8). Модератор видит, на что пожаловались, и решает:
// «Скрыть контент» (resolve - скрыть нарушающий UGC / снять товар) или «Отклонить
// жалобу» (dismiss - нарушения нет). Действия под IsAdmin на бэке; роль-гейт
// страницы - AdminRoute. Состояния Ф0: skeleton/пусто/ErrorState, без alert().
// UGC выводится как текст (React экранирует), без dangerouslySetInnerHTML (§9).

const TARGET_LABEL = {
  product: 'Товар', review: 'Отзыв', seller: 'Продавец',
  question: 'Вопрос', answer: 'Ответ',
}

// Что показать модератору по типу цели (без PII - превью приходит с бэка).
// targetId нужен для ссылки на товар (его id == report.target_id).
function TargetPreview({ type, target, targetId }) {
  if (!target || target.exists === false) {
    return <p className="text-sm text-ink-faint italic">Цель удалена</p>
  }
  if (type === 'product') {
    return (
      <div className="text-sm text-ink-soft">
        <Link to={`/products/${targetId}`} className="font-semibold hover:underline">
          {target.title}
        </Link>
        <p className="text-xs text-ink-faint mt-0.5">
          Продавец: {target.seller || '—'} · статус: {target.status}
        </p>
      </div>
    )
  }
  if (type === 'review') {
    return (
      <div className="text-sm text-ink-soft">
        <p className="text-xs text-ink-faint mb-1">
          Отзыв от {target.author} · оценка {target.rating}★
          {target.is_hidden ? ' · уже скрыт' : ''}
        </p>
        <p className="line-clamp-3">{target.text}</p>
      </div>
    )
  }
  if (type === 'question' || type === 'answer') {
    return (
      <div className="text-sm text-ink-soft">
        <p className="text-xs text-ink-faint mb-1">
          {TARGET_LABEL[type]} от {target.author}
          {target.is_hidden ? ' · уже скрыт' : ''}
        </p>
        <p className="line-clamp-3">{target.text}</p>
      </div>
    )
  }
  if (type === 'seller') {
    return <p className="text-sm text-ink-soft">Магазин: {target.shop}</p>
  }
  return null
}

function ReportCard({ report, busy, onResolve, onDismiss }) {
  const [note, setNote] = useState('')

  return (
    <div className="bg-card rounded-2xl border border-line p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-ink-soft bg-surface px-2 py-0.5 rounded-lg">
            {TARGET_LABEL[report.target_type] || report.target_type}
          </span>
          <span className="text-xs font-bold text-danger bg-danger/10 px-2 py-0.5 rounded-lg">
            {report.reason_display}
          </span>
        </div>
        <span className="text-xs text-ink-faint">
          {report.reporter ? `от ${report.reporter}` : 'аноним'}
          {report.created_at ? ` · ${new Date(report.created_at).toLocaleDateString('ru-RU')}` : ''}
        </span>
      </div>

      {/* Цель жалобы */}
      <div className="bg-surface border border-line rounded-xl p-3 mb-3">
        <TargetPreview type={report.target_type} target={report.target} targetId={report.target_id} />
      </div>

      {/* Комментарий жалобщика */}
      {report.comment && (
        <p className="text-sm text-ink-faint mb-3">
          <span className="font-semibold text-ink-soft">Комментарий: </span>
          {report.comment}
        </p>
      )}

      {/* Заметка модератора + действия */}
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Заметка модератора (необязательно)"
        className="w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition mb-3"
      />
      <div className="flex items-center gap-2">
        <button
          onClick={() => onResolve(report, note.trim())}
          disabled={busy}
          className="bg-danger text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-danger/90 transition disabled:opacity-50"
        >
          {busy ? 'Обработка…' : 'Скрыть контент'}
        </button>
        <button
          onClick={() => onDismiss(report, note.trim())}
          disabled={busy}
          className="px-4 py-2 rounded-xl font-semibold text-sm text-ink-soft border border-line-strong hover:bg-surface transition disabled:opacity-50"
        >
          Отклонить жалобу
        </button>
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    fetchQueue()
  }, [])

  async function fetchQueue() {
    setLoading(true)
    setListError(false)
    try {
      const res = await api.get('/products/reports/')
      setItems(res.data.results ?? res.data)
    } catch {
      setListError(true)
    } finally {
      setLoading(false)
    }
  }

  const handleResolve = async (report, note) => {
    setBusyId(report.id)
    try {
      await api.post(`/products/reports/${report.id}/resolve/`, { note })
      toast.success('Жалоба обработана, контент скрыт')
      await fetchQueue()
    } catch (err) {
      // 409 - другой модератор уже закрыл жалобу: перечитываем очередь.
      toast.error(err.response?.data?.error || 'Не удалось обработать жалобу')
      if (err.response?.status === 409) await fetchQueue()
    } finally {
      setBusyId(null)
    }
  }

  const handleDismiss = async (report, note) => {
    setBusyId(report.id)
    try {
      await api.post(`/products/reports/${report.id}/dismiss/`, { note })
      toast.success('Жалоба отклонена')
      await fetchQueue()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось отклонить жалобу')
      if (err.response?.status === 409) await fetchQueue()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-ink rounded-2xl p-6 mb-6"
        >
          <p className="text-xs font-semibold text-accent-soft uppercase tracking-widest mb-1">Администрирование</p>
          <h1 className="font-display text-2xl font-bold text-white">Жалобы и модерация</h1>
          <p className="text-ink-faint text-sm mt-1">
            Скройте нарушающий контент или отклоните жалобу, если нарушения нет
          </p>
        </motion.div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="bg-card rounded-2xl h-40 skeleton" />)}
          </div>
        ) : listError ? (
          <ErrorState title="Не удалось загрузить очередь жалоб" onRetry={fetchQueue} />
        ) : items.length === 0 ? (
          <EmptyState icon={<Icon name="check" className="w-7 h-7 text-ink-faint" />} title="Жалоб нет" subtitle="Очередь модерации пуста" />
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {items.map((r) => (
                <motion.div
                  key={r.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                >
                  <ReportCard
                    report={r}
                    busy={busyId === r.id}
                    onResolve={handleResolve}
                    onDismiss={handleDismiss}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}
