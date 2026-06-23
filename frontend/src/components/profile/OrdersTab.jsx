import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import EmptyState from '../states/EmptyState'
import ErrorState from '../states/ErrorState'
import useAsyncData from '../../hooks/useAsyncData'
import useCartStore from '../../store/cartStore'
import { toast } from '../../store/toastStore'

const STATUS_CONFIG = {
  created:    { label: 'Создан',       color: 'bg-gray-100 text-gray-600',       icon: '🕐' },
  paid:       { label: 'Оплачен',      color: 'bg-blue-100 text-blue-600',       icon: '💳' },
  processing: { label: 'В обработке',  color: 'bg-amber-100 text-amber-600',     icon: '⚙️' },
  shipped:    { label: 'Отправлен',    color: 'bg-purple-100 text-purple-600',   icon: '🚚' },
  delivered:  { label: 'Доставлен',    color: 'bg-emerald-100 text-emerald-600', icon: '✅' },
  cancelled:  { label: 'Отменён',      color: 'bg-red-100 text-red-600',         icon: '❌' },
}
const DELIVERY_LABELS = { pickup: 'Самовывоз', courier: 'Курьер', post: 'Почта России' }
const PAYMENT_LABELS = { card: 'Картой онлайн', on_delivery: 'При получении', installments: 'Частями' }
// Отмена доступна покупателю только в этих статусах (как требует OrderCancelView).
const CANCELLABLE = ['created', 'paid']

export default function OrdersTab() {
  const navigate = useNavigate()
  const addToCart = useCartStore((s) => s.addToCart)
  const [expanded, setExpanded] = useState(null)
  const [busyId, setBusyId] = useState(null)

  const { data, status, retry } = useAsyncData(
    (signal) =>
      api.get('/orders/', { signal }).then((r) => r.data.results ?? r.data),
    []
  )
  const orders = data || []

  // «Повторить»: кладём позиции в корзину существующим API (он сам режет по
  // стоку/доступности). Удалённый товар (product=null) пропускаем. Тост честно
  // сообщает «N из M» (граничный случай плана).
  const handleRepeat = async (order) => {
    const items = order.items || []
    setBusyId(order.id)
    let added = 0
    for (const it of items) {
      if (!it.product) continue
      try {
        await addToCart(it.product, it.quantity, it.size, it.color)
        added += 1
      } catch {
        // распродано/снято - пропускаем
      }
    }
    setBusyId(null)
    if (added === 0) {
      toast.error('Товары из заказа сейчас недоступны')
      return
    }
    toast.success(
      added === items.length
        ? 'Все товары добавлены в корзину'
        : `Добавлено ${added} из ${items.length}, часть недоступна`
    )
    navigate('/cart')
  }

  // «Отменить»: подтверждение -> готовый эндпоинт. При гонке статусов бэк вернёт
  // 400 - показываем ошибку, не зависаем. Список перечитываем (статус обновится).
  const handleCancel = async (order) => {
    if (!window.confirm(`Отменить заказ #${order.id}? Товары вернутся в продажу.`)) return
    setBusyId(order.id)
    try {
      await api.post(`/orders/${order.id}/cancel/`)
      toast.success('Заказ отменён')
      retry()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Не удалось отменить заказ')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <motion.div key="orders" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-xl font-black text-gray-900">Мои заказы</h2>
        {status === 'ready' && <span className="text-sm text-gray-400">{orders.length} заказов</span>}
      </div>

      {status === 'loading' ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-20 animate-pulse" />)}
        </div>
      ) : status === 'error' ? (
        <ErrorState onRetry={retry} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon="📭"
          title="Заказов пока нет"
          subtitle="Самое время выбрать что-нибудь в каталоге"
          action={{ label: 'В каталог', onClick: () => navigate('/catalog') }}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {orders.map((order, i) => {
            const st = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.created
            const isExpanded = expanded === order.id
            const busy = busyId === order.id
            return (
              <motion.div key={order.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="bg-white rounded-2xl overflow-hidden border border-gray-100">
                <button onClick={() => setExpanded(isExpanded ? null : order.id)} className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-lg border border-gray-100 shrink-0">{st.icon}</div>
                    <div className="text-left min-w-0">
                      <p className="font-bold text-gray-800">Заказ #{order.id}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{new Date(order.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${st.color} hidden sm:inline`}>{st.label}</span>
                    <span className="font-black text-gray-900">{Number(order.total_price).toLocaleString()} ₽</span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-gray-100 overflow-hidden">
                      <div className="p-5 flex flex-col gap-2">
                        <span className={`px-3 py-1.5 rounded-xl text-xs font-semibold self-start sm:hidden ${st.color}`}>{st.label}</span>
                        {order.recipient_name && <p className="text-sm text-gray-500">👤 {order.recipient_name}{order.recipient_phone ? `, ${order.recipient_phone}` : ''}</p>}
                        {order.delivery_address && <p className="text-sm text-gray-500">📍 {DELIVERY_LABELS[order.delivery_method] ?? 'Доставка'}: {order.delivery_address}</p>}
                        {order.payment_method && <p className="text-sm text-gray-500">💳 {PAYMENT_LABELS[order.payment_method] ?? 'Оплата'}</p>}
                        <div className="mt-1">
                          {(order.items ?? []).map((item) => (
                            <div key={item.id} className="flex justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                              <span className="text-gray-700">
                                {item.product_name}
                                {(item.size || item.color) && (
                                  <span className="text-gray-400"> · {[item.size, item.color].filter(Boolean).join(' / ')}</span>
                                )}
                              </span>
                              <span className="text-gray-500 shrink-0 ml-4">{item.quantity} шт. × {Number(item.price_at_purchase).toLocaleString()} ₽</span>
                            </div>
                          ))}
                        </div>

                        {/* Действия по заказу */}
                        <div className="flex flex-wrap gap-2 mt-3">
                          <button
                            onClick={() => handleRepeat(order)}
                            disabled={busy}
                            className="text-xs font-semibold bg-[#111] text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition disabled:opacity-50"
                          >
                            {busy ? 'Добавляем...' : 'Повторить заказ'}
                          </button>
                          {CANCELLABLE.includes(order.status) && (
                            <button
                              onClick={() => handleCancel(order)}
                              disabled={busy}
                              className="text-xs font-semibold text-red-500 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-50 transition disabled:opacity-50"
                            >
                              Отменить заказ
                            </button>
                          )}
                          {order.status === 'delivered' && (
                            <button
                              onClick={() => navigate(`/profile?tab=returns&order=${order.id}`)}
                              className="text-xs font-semibold text-gray-500 border border-gray-200 px-4 py-2 rounded-xl hover:bg-gray-50 transition"
                            >
                              Оформить возврат
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}
    </motion.div>
  )
}
