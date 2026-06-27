import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import api from '../../api'
import { toast } from '../../store/toastStore'
import ErrorState from '../states/ErrorState'
import ConfirmModal from './ConfirmModal'
import SellerOrderCard from './SellerOrderCard'

// Рабочее место заказов продавца (Ф14, узел 2.6): список заказов с его товарами,
// фильтр по статусу, раскрытие деталей и проведение по статусам.
// Смену статуса делает существующий PATCH /orders/{id}/status/ (S4-авторизация),
// список читается из нового /orders/seller/ (план 4.1, 4.3).

const FILTERS = [
  { id: 'all', label: 'Все' },
  { id: 'created', label: 'Новые' },
  { id: 'paid', label: 'Принятые' },
  { id: 'processing', label: 'Собираются' },
  { id: 'shipped', label: 'В доставке' },
  { id: 'delivered', label: 'Доставлены' },
  { id: 'cancelled', label: 'Отменённые' },
]

export default function SellerOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [statusFilter, setStatusFilter] = useState('all')
  const [expandedId, setExpandedId] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelling, setCancelling] = useState(false)

  useEffect(() => {
    fetchOrders(statusFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  async function fetchOrders(status = statusFilter) {
    setLoading(true)
    setListError(false)
    try {
      const params = status && status !== 'all' ? { status } : {}
      const res = await api.get('/orders/seller/', { params })
      setOrders(res.data.results ?? res.data)
    } catch {
      setListError(true)
    } finally {
      setLoading(false)
    }
  }

  // Смена статуса через существующий эндпоинт. Гонка (покупатель отменил) -> бэк
  // вернёт 400, показываем ошибку и перечитываем список (план §6).
  const handleStatus = async (order, newStatus) => {
    setBusyId(order.id)
    try {
      await api.patch(`/orders/${order.id}/status/`, { status: newStatus })
      toast.success('Статус заказа обновлён')
      await fetchOrders()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось сменить статус')
      await fetchOrders()
    } finally {
      setBusyId(null)
    }
  }

  const confirmCancel = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await api.patch(`/orders/${cancelTarget.id}/status/`, { status: 'cancelled' })
      toast.success('Заказ отменён, товары возвращены в продажу')
      setCancelTarget(null)
      await fetchOrders()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось отменить заказ')
    } finally {
      setCancelling(false)
    }
  }

  const toggle = (id) => setExpandedId((cur) => (cur === id ? null : id))
  const emptyText = statusFilter === 'all' ? 'Заказов пока нет' : 'Нет заказов в этом статусе'

  return (
    <motion.div key="orders" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Фильтр по статусу */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-5">
        {FILTERS.map((f) => {
          const active = statusFilter === f.id
          return (
            <motion.button
              key={f.id}
              onClick={() => setStatusFilter(f.id)}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-all ${
                active ? 'bg-ink text-white shadow-sm' : 'bg-card text-ink-faint hover:text-ink border border-line'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {f.label}
            </motion.button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-card rounded-2xl h-20 skeleton" />)}
        </div>
      ) : listError ? (
        <ErrorState title="Не удалось загрузить заказы" onRetry={() => fetchOrders()} />
      ) : orders.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-line">
          <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-ink-faint">{emptyText}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order) => (
            <SellerOrderCard
              key={order.id}
              order={order}
              expanded={expandedId === order.id}
              onToggle={toggle}
              busy={busyId === order.id}
              onStatus={handleStatus}
              onCancel={setCancelTarget}
            />
          ))}
        </div>
      )}

      {/* Подтверждение отмены (модалка вместо confirm(), как в реестре товаров) */}
      {cancelTarget && (
        <ConfirmModal
          title={`Отменить заказ #${cancelTarget.id}?`}
          message="Товары вернутся в продажу, покупатель получит уведомление."
          confirmLabel="Отменить заказ"
          loadingLabel="Отменяем…"
          loading={cancelling}
          onConfirm={confirmCancel}
          onCancel={() => !cancelling && setCancelTarget(null)}
        />
      )}
    </motion.div>
  )
}
