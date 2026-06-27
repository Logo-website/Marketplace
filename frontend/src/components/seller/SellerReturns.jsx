import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import api from '../../api'
import { toast } from '../../store/toastStore'
import ErrorState from '../states/ErrorState'

// Возвраты продавца (Ф23, узел 2.7): заявки на ЕГО товары (S4), проведение по
// машине статусов - принять/отклонить, приёмка (восстановит сток), возврат денег.
const STATUS_CONFIG = {
  requested: { label: 'Новая заявка',      color: 'bg-warning/10 text-warning' },
  approved:  { label: 'Одобрен',           color: 'bg-accent-soft text-accent' },
  received:  { label: 'Товар принят',      color: 'bg-surface text-ink-soft' },
  refunded:  { label: 'Деньги возвращены', color: 'bg-success/10 text-success' },
  rejected:  { label: 'Отклонён',          color: 'bg-danger/10 text-danger' },
  disputed:  { label: 'Спор (арбитраж)',   color: 'bg-warning/10 text-warning' },
}
const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'requested', label: 'Новые' },
  { id: 'approved', label: 'Одобренные' },
  { id: 'received', label: 'Принятые' },
  { id: 'refunded', label: 'Возвращённые' },
  { id: 'disputed', label: 'Споры' },
]

export default function SellerReturns() {
  const [returns, setReturns] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    fetchReturns(statusFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  async function fetchReturns(status = statusFilter) {
    setLoading(true)
    setListError(false)
    try {
      const params = status && status !== 'all' ? { status } : {}
      const res = await api.get('/orders/seller/returns/', { params })
      setReturns(res.data.results ?? res.data)
    } catch {
      setListError(true)
    } finally {
      setLoading(false)
    }
  }

  const patchStatus = async (ret, status, comment) => {
    setBusyId(ret.id)
    try {
      const body = { status }
      if (comment) body.resolution_comment = comment
      await api.patch(`/orders/seller/returns/${ret.id}/`, body)
      toast.success('Статус возврата обновлён')
      await fetchReturns()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось обновить статус')
    } finally {
      setBusyId(null)
    }
  }

  const handleReject = (ret) => {
    const comment = window.prompt('Причина отказа (покупатель её увидит):', '')
    if (comment === null) return // отмена
    patchStatus(ret, 'rejected', comment.trim())
  }

  return (
    <motion.div key="returns" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Фильтр по статусу */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setStatusFilter(f.id)}
            className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition ${
              statusFilter === f.id ? 'bg-ink text-white' : 'bg-card text-ink-faint border border-line hover:bg-surface'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">{[...Array(3)].map((_, i) => <div key={i} className="bg-card rounded-2xl h-28 skeleton" />)}</div>
      ) : listError ? (
        <ErrorState title="Не удалось загрузить возвраты" onRetry={() => fetchReturns()} />
      ) : returns.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-line">
          <p className="text-4xl mb-3">↩️</p>
          <p className="text-ink-faint">{statusFilter === 'all' ? 'Возвратов пока нет' : 'Нет возвратов в этом статусе'}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {returns.map((ret) => {
            const st = STATUS_CONFIG[ret.status] ?? STATUS_CONFIG.requested
            const busy = busyId === ret.id
            return (
              <div key={ret.id} className="bg-card rounded-2xl border border-line p-5">
                <div className="flex items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="font-bold text-ink">Возврат по заказу #{ret.order_id}</p>
                    <p className="text-xs text-ink-faint mt-0.5">{ret.buyer_name} · {new Date(ret.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                  <span className={`px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 ${st.color}`}>{st.label}</span>
                </div>

                <div className="text-sm text-ink-soft mb-2">
                  {(ret.items ?? []).map((it) => (
                    <div key={it.id} className="flex justify-between py-1 border-b border-line last:border-0">
                      <span>{it.product_name}{(it.size || it.color) && <span className="text-ink-faint"> · {[it.size, it.color].filter(Boolean).join(' / ')}</span>}</span>
                      <span className="text-ink-faint shrink-0 ml-3">{it.quantity} шт.</span>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="text-ink-faint">{ret.reason_display}</span>
                  <span className="font-bold text-ink">{Number(ret.refund_amount).toLocaleString()} ₽</span>
                </div>
                {/* UGC покупателя: текст как текст, фото как картинка (не HTML) */}
                {ret.reason_text && <p className="text-sm text-ink-faint mb-2 whitespace-pre-line">{ret.reason_text}</p>}
                {ret.photo && <img src={ret.photo} alt="Фото возврата" className="w-24 h-24 object-cover rounded-xl border border-line mb-2" />}

                {/* Действия по машине статусов */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {ret.status === 'requested' && (
                    <>
                      <button onClick={() => patchStatus(ret, 'approved')} disabled={busy} className="text-xs font-semibold bg-ink text-white px-4 py-2 rounded-xl hover:bg-ink/90 transition disabled:opacity-50">Одобрить</button>
                      <button onClick={() => handleReject(ret)} disabled={busy} className="text-xs font-semibold text-danger border border-danger/30 px-4 py-2 rounded-xl hover:bg-danger/10 transition disabled:opacity-50">Отклонить</button>
                    </>
                  )}
                  {ret.status === 'approved' && (
                    <button onClick={() => patchStatus(ret, 'received')} disabled={busy} className="text-xs font-semibold bg-ink text-white px-4 py-2 rounded-xl hover:bg-ink/90 transition disabled:opacity-50">Товар принят</button>
                  )}
                  {ret.status === 'received' && (
                    <button onClick={() => patchStatus(ret, 'refunded')} disabled={busy} className="text-xs font-semibold bg-success text-white px-4 py-2 rounded-xl hover:bg-success/90 transition disabled:opacity-50">Вернуть деньги</button>
                  )}
                  {ret.status === 'disputed' && (
                    <p className="text-xs text-warning">Спор передан на арбитраж администрации площадки.</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
