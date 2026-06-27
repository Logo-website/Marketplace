import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../../api'
import { toast } from '../../store/toastStore'
import ErrorState from '../../components/states/ErrorState'
import EmptyState from '../../components/states/EmptyState'

// Очередь модерации товаров (Ф17, узел 3.2). Админ видит, что прислал продавец,
// и принимает решение: одобрить (-> active, попадает в каталог) или отклонить с
// причиной (-> rejected, причину продавец видит в реестре Ф13). Действия идут под
// IsAdmin на бэке; роль-гейт страницы - AdminRoute. Состояния по Ф0: skeleton/
// пусто/ErrorState, без alert(). Причина при отклонении - обязательное поле.

function attrChips(attributes) {
  // Ключевое, что проверяет модератор: бренд, размеры, цвета (из контракта
  // attributes Ф12). Без полей - пустой массив, чипы не рисуются.
  const a = attributes || {}
  const chips = []
  if (a.brand) chips.push(a.brand)
  if (Array.isArray(a.sizes) && a.sizes.length) {
    chips.push(`Размеры: ${a.sizes.map((s) => s.label).join(', ')}`)
  }
  if (Array.isArray(a.colors) && a.colors.length) {
    chips.push(`Цвета: ${a.colors.map((c) => c.label).join(', ')}`)
  }
  return chips
}

function ModerationCard({ product, busy, onApprove, onReject }) {
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState('')
  const cover = product.images?.[0]
  const coverUrl = cover?.image_url || cover?.image || null

  return (
    <div className="bg-card rounded-2xl border border-line p-5">
      <div className="flex gap-4">
        {/* Превью фото */}
        <div className="w-20 h-20 sm:w-24 sm:h-24 bg-surface rounded-xl overflow-hidden shrink-0 flex items-center justify-center">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              className="w-full h-full object-cover"
              onError={(e) => { e.target.style.display = 'none' }}
            />
          ) : (
            <span className="text-2xl">📦</span>
          )}
        </div>

        {/* Заявка */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <Link
              to={`/products/${product.id}`}
              className="font-semibold text-ink hover:underline line-clamp-2"
            >
              {product.name}
            </Link>
            <span className="text-base font-black text-ink shrink-0">
              {Number(product.price).toLocaleString()} ₽
            </span>
          </div>
          <p className="text-xs text-ink-faint mt-0.5">
            {product.seller_name}
            {product.category_name ? ` · ${product.category_name}` : ''}
          </p>
          {product.description && (
            <p className="text-sm text-ink-soft mt-2 line-clamp-2">{product.description}</p>
          )}
          {attrChips(product.attributes).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {attrChips(product.attributes).map((chip, i) => (
                <span key={i} className="text-xs bg-surface text-ink-soft px-2 py-0.5 rounded-lg">
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Действия */}
      {!rejecting ? (
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => onApprove(product)}
            disabled={busy}
            className="bg-success text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-success/90 transition disabled:opacity-50"
          >
            {busy ? 'Обработка…' : 'Одобрить'}
          </button>
          <button
            onClick={() => setRejecting(true)}
            disabled={busy}
            className="px-4 py-2 rounded-xl font-semibold text-sm text-danger border border-danger/30 hover:bg-danger/10 transition disabled:opacity-50"
          >
            Отклонить
          </button>
        </div>
      ) : (
        <div className="mt-4">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Причина отклонения — её увидит продавец и сможет исправить товар"
            rows={3}
            className="w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-danger focus:ring-2 focus:ring-danger/20 transition resize-none"
          />
          <div className="flex items-center gap-2 mt-2">
            <button
              onClick={() => onReject(product, reason.trim(), () => setRejecting(false))}
              disabled={busy || !reason.trim()}
              className="bg-danger text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-danger/90 transition disabled:opacity-50"
            >
              {busy ? 'Отклоняем…' : 'Подтвердить отклонение'}
            </button>
            <button
              onClick={() => { setRejecting(false); setReason('') }}
              className="px-4 py-2 rounded-xl font-semibold text-sm text-ink-faint hover:text-ink transition"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ModerationPage() {
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
      const res = await api.get('/products/moderation/')
      setItems(res.data.results ?? res.data)
    } catch {
      setListError(true)
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (product) => {
    setBusyId(product.id)
    try {
      await api.post(`/products/moderation/${product.id}/approve/`)
      toast.success('Товар одобрен и опубликован в каталоге')
      await fetchQueue()
    } catch (err) {
      // 409 - другой админ уже промодерировал: перечитываем очередь.
      toast.error(err.response?.data?.error || 'Не удалось одобрить товар')
      if (err.response?.status === 409) await fetchQueue()
    } finally {
      setBusyId(null)
    }
  }

  const handleReject = async (product, reason, done) => {
    setBusyId(product.id)
    try {
      await api.post(`/products/moderation/${product.id}/reject/`, { reason })
      toast.success('Товар отклонён, продавец увидит причину')
      done?.()
      await fetchQueue()
    } catch (err) {
      toast.error(
        err.response?.data?.reason?.[0] ||
        err.response?.data?.error ||
        'Не удалось отклонить товар'
      )
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
          <h1 className="text-2xl font-black text-white">Модерация товаров</h1>
          <p className="text-ink-faint text-sm mt-1">
            Одобрите товар для публикации в каталоге или отклоните с причиной
          </p>
        </motion.div>

        {loading ? (
          <div className="flex flex-col gap-3">
            {[...Array(4)].map((_, i) => <div key={i} className="bg-card rounded-2xl h-32 skeleton" />)}
          </div>
        ) : listError ? (
          <ErrorState title="Не удалось загрузить очередь модерации" onRetry={fetchQueue} />
        ) : items.length === 0 ? (
          <EmptyState icon="✓" title="Очередь пуста" subtitle="Нет товаров, ожидающих модерации" />
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {items.map((p) => (
                <motion.div
                  key={p.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                >
                  <ModerationCard
                    product={p}
                    busy={busyId === p.id}
                    onApprove={handleApprove}
                    onReject={handleReject}
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
