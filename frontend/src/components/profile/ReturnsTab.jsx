import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../../api'
import EmptyState from '../states/EmptyState'
import ErrorState from '../states/ErrorState'
import useAsyncData from '../../hooks/useAsyncData'
import { toast } from '../../store/toastStore'

// Статусы возврата (Ф23) - совпадают с ReturnRequest.STATUS_CHOICES на бэкенде.
const STATUS_CONFIG = {
  requested: { label: 'Заявка подана',      color: 'bg-warning/10 text-warning' },
  approved:  { label: 'Одобрен',            color: 'bg-accent-soft text-accent' },
  received:  { label: 'Товар принят',       color: 'bg-surface text-ink-soft' },
  refunded:  { label: 'Деньги возвращены',  color: 'bg-success/10 text-success' },
  rejected:  { label: 'Отклонён',           color: 'bg-danger/10 text-danger' },
  disputed:  { label: 'Спор',               color: 'bg-warning/10 text-warning' },
}
const REASONS = [
  { value: 'size', label: 'Не подошёл размер' },
  { value: 'defect', label: 'Брак / дефект' },
  { value: 'not_as_described', label: 'Не соответствует описанию' },
  { value: 'changed_mind', label: 'Передумал(а)' },
  { value: 'other', label: 'Другое' },
]
const METHODS = [
  { value: 'pickup', label: 'Пункт выдачи' },
  { value: 'courier', label: 'Курьер' },
]

export default function ReturnsTab() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  // Создаём заявку для конкретного заказа: deep-link ?tab=returns&order=<id>
  // (кнопка «Оформить возврат» в табе «Заказы»).
  const creatingOrderId = searchParams.get('order')

  const returnsQuery = useAsyncData(
    (signal) => api.get('/orders/returns/', { signal }).then((r) => r.data.results ?? r.data),
    []
  )
  const returns = returnsQuery.data || []

  if (creatingOrderId) {
    return <ReturnForm
      orderId={creatingOrderId}
      onCancel={() => setSearchParams({ tab: 'returns' })}
      onDone={() => { setSearchParams({ tab: 'returns' }); returnsQuery.retry() }}
    />
  }

  if (returnsQuery.status === 'loading') {
    return <div className="flex flex-col gap-3">{[...Array(3)].map((_, i) => <div key={i} className="bg-card rounded-2xl h-24 animate-pulse" />)}</div>
  }
  if (returnsQuery.status === 'error') return <ErrorState onRetry={returnsQuery.retry} />

  return (
    <motion.div key="returns" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <h2 className="text-xl font-black text-ink mb-5">Возвраты</h2>
      {returns.length === 0 ? (
        <EmptyState
          icon="↩️"
          title="Возвратов пока нет"
          subtitle="Оформить возврат можно из доставленного заказа на вкладке «Заказы»"
          action={{ label: 'К заказам', onClick: () => navigate('/profile?tab=orders') }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {returns.map((r) => (
            <ReturnCard key={r.id} ret={r} onDisputed={returnsQuery.retry} />
          ))}
        </div>
      )}
    </motion.div>
  )
}

function ReturnCard({ ret, onDisputed }) {
  const [busy, setBusy] = useState(false)
  const st = STATUS_CONFIG[ret.status] ?? STATUS_CONFIG.requested

  const handleDispute = async () => {
    if (!window.confirm('Оспорить отказ? Заявку рассмотрит администрация площадки.')) return
    setBusy(true)
    try {
      await api.post(`/orders/returns/${ret.id}/dispute/`)
      toast.success('Заявка отправлена в арбитраж')
      onDisputed()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось оспорить')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="bg-card rounded-2xl border border-line p-5">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <p className="font-bold text-ink">Возврат по заказу #{ret.order_id}</p>
          <p className="text-xs text-ink-faint mt-0.5">{new Date(ret.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
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

      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-faint">{ret.reason_display}</span>
        <span className="font-bold text-ink">К возврату: {Number(ret.refund_amount).toLocaleString()} ₽</span>
      </div>

      {/* Причина-текст и фото - UGC, выводятся как текст/картинка (не HTML) */}
      {ret.reason_text && <p className="text-sm text-ink-faint mt-2 whitespace-pre-line">{ret.reason_text}</p>}
      {ret.photo && (
        <img src={ret.photo} alt="Фото возврата" className="mt-2 w-24 h-24 object-cover rounded-xl border border-line" />
      )}
      {ret.resolution_comment && (
        <p className="text-sm text-ink-faint mt-2 bg-surface rounded-xl p-3">
          <span className="font-semibold text-ink-soft">Комментарий: </span>{ret.resolution_comment}
        </p>
      )}

      {/* Оспорить можно только отклонённую и ещё не прошедшую арбитраж заявку */}
      {ret.status === 'rejected' && !ret.arbitrated && (
        <button
          onClick={handleDispute}
          disabled={busy}
          className="mt-3 text-xs font-semibold text-warning border border-warning/30 px-4 py-2 rounded-xl hover:bg-warning/10 transition disabled:opacity-50"
        >
          {busy ? 'Отправляем...' : 'Оспорить отказ'}
        </button>
      )}
    </div>
  )
}

function ReturnForm({ orderId, onCancel, onDone }) {
  const [selected, setSelected] = useState({}) // {order_item_id: qty}
  const [reason, setReason] = useState('size')
  const [reasonText, setReasonText] = useState('')
  const [method, setMethod] = useState('pickup')
  const [photo, setPhoto] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const { data, status, retry } = useAsyncData(
    (signal) => api.get(`/orders/${orderId}/`, { signal }).then((r) => r.data),
    [orderId]
  )

  if (status === 'loading') return <div className="bg-card rounded-2xl h-64 animate-pulse" />
  if (status === 'error') return <ErrorState onRetry={retry} />

  const order = data
  if (order.status !== 'delivered') {
    return (
      <div className="bg-card rounded-2xl border border-line p-6 text-center">
        <p className="text-ink-faint">Возврат доступен только для доставленных заказов.</p>
        <button onClick={onCancel} className="mt-3 text-sm font-semibold text-accent hover:underline">Назад</button>
      </div>
    )
  }
  // Возврат только по существующим (не удалённым) товарам.
  const items = (order.items || []).filter((it) => it.product)

  const toggle = (it) => {
    setSelected((prev) => {
      const next = { ...prev }
      if (next[it.id]) delete next[it.id]
      else next[it.id] = 1
      return next
    })
  }
  const setQty = (it, qty) => {
    const q = Math.max(1, Math.min(it.quantity, Number(qty) || 1))
    setSelected((prev) => ({ ...prev, [it.id]: q }))
  }

  const handleSubmit = async () => {
    const chosen = Object.entries(selected)
    if (chosen.length === 0) { toast.error('Выберите хотя бы одну позицию'); return }
    setSubmitting(true)
    const fd = new FormData()
    fd.append('order', orderId)
    fd.append('reason', reason)
    fd.append('reason_text', reasonText)
    fd.append('method', method)
    fd.append('items', JSON.stringify(chosen.map(([id, qty]) => ({ order_item: Number(id), quantity: qty }))))
    if (photo) fd.append('photo', photo)
    try {
      await api.post('/orders/returns/', fd)
      toast.success('Заявка на возврат создана')
      onDone()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось оформить возврат')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-card rounded-2xl border border-line p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-black text-ink">Возврат заказа #{orderId}</h2>
        <button onClick={onCancel} className="text-sm text-ink-faint hover:text-ink-soft">Отмена</button>
      </div>

      <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">Что возвращаем</p>
      <div className="flex flex-col gap-2 mb-4">
        {items.map((it) => {
          const checked = !!selected[it.id]
          return (
            <div key={it.id} className={`rounded-xl border p-3 transition ${checked ? 'border-ink bg-surface' : 'border-line'}`}>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={checked} onChange={() => toggle(it)} className="w-4 h-4 accent-ink" />
                <span className="flex-1 text-sm text-ink-soft">
                  {it.product_name}
                  {(it.size || it.color) && <span className="text-ink-faint"> · {[it.size, it.color].filter(Boolean).join(' / ')}</span>}
                </span>
                <span className="text-xs text-ink-faint">{Number(it.price_at_purchase).toLocaleString()} ₽</span>
              </label>
              {checked && it.quantity > 1 && (
                <div className="flex items-center gap-2 mt-2 pl-7">
                  <span className="text-xs text-ink-faint">Количество:</span>
                  <input
                    type="number" min="1" max={it.quantity} value={selected[it.id]}
                    onChange={(e) => setQty(it, e.target.value)}
                    className="w-16 border border-line-strong rounded-lg px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-ink-faint">из {it.quantity}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">Причина</p>
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border border-line-strong rounded-xl px-3 py-2.5 text-sm mb-3">
        {REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
      </select>
      <textarea
        value={reasonText} onChange={(e) => setReasonText(e.target.value)} rows={2} maxLength={2000}
        placeholder="Комментарий (необязательно)"
        className="w-full border border-line-strong rounded-xl px-3 py-2.5 text-sm mb-3 resize-none"
      />

      <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">Фото (необязательно)</p>
      <input
        type="file" accept="image/*"
        onChange={(e) => setPhoto(e.target.files?.[0] || null)}
        className="w-full text-sm text-ink-faint mb-4 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-surface file:text-sm file:font-semibold"
      />

      <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">Способ возврата</p>
      <div className="flex gap-2 mb-5">
        {METHODS.map((m) => (
          <button
            key={m.value} onClick={() => setMethod(m.value)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold border transition ${method === m.value ? 'border-ink bg-ink text-white' : 'border-line-strong text-ink-soft'}`}
          >
            {m.label}
          </button>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        className="w-full bg-ink text-white font-semibold py-3 rounded-xl hover:bg-ink/90 transition disabled:opacity-50"
      >
        {submitting ? 'Отправляем...' : 'Оформить возврат'}
      </button>
    </motion.div>
  )
}
