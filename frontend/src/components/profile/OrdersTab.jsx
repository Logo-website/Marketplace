import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import EmptyState from '../states/EmptyState'
import ErrorState from '../states/ErrorState'
import Icon from '../ui/Icon'
import ReceiptCard from '../ReceiptCard'
import useAsyncData from '../../hooks/useAsyncData'
import useCartStore from '../../store/cartStore'
import { toast } from '../../store/toastStore'

// tone - цвет глифа заказа в кружке: статус читается «с одного взгляда» даже на
// мобильном свёрнутом виде, где цветной бейдж скрыт (раньше эту роль играло emoji).
const STATUS_CONFIG = {
  created:    { label: 'Создан',       color: 'bg-surface text-ink-soft',   tone: 'text-ink-faint' },
  paid:       { label: 'Оплачен',      color: 'bg-accent-soft text-accent', tone: 'text-accent' },
  processing: { label: 'В обработке',  color: 'bg-warning/10 text-warning', tone: 'text-warning' },
  shipped:    { label: 'Отправлен',    color: 'bg-accent-soft text-accent', tone: 'text-accent' },
  delivered:  { label: 'Доставлен',    color: 'bg-success/10 text-success', tone: 'text-success' },
  cancelled:  { label: 'Отменён',      color: 'bg-danger/10 text-danger',   tone: 'text-danger' },
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
        <h2 className="font-display text-xl font-bold text-ink">Мои заказы</h2>
        {status === 'ready' && <span className="text-sm text-ink-faint">{orders.length} заказов</span>}
      </div>

      {status === 'loading' ? (
        <div className="flex flex-col gap-3">
          {[...Array(3)].map((_, i) => <div key={i} className="bg-card rounded-2xl h-20 animate-pulse" />)}
        </div>
      ) : status === 'error' ? (
        <ErrorState onRetry={retry} />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<Icon name="inbox" className="w-7 h-7 text-ink-faint" />}
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
              <motion.div key={order.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="bg-card rounded-2xl overflow-hidden border border-line">
                <button onClick={() => setExpanded(isExpanded ? null : order.id)} className="w-full p-5 flex items-center justify-between hover:bg-surface transition gap-3">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className={`w-10 h-10 bg-surface rounded-xl flex items-center justify-center border border-line shrink-0 ${st.tone}`}><Icon name="orders" className="w-5 h-5" /></div>
                    <div className="text-left min-w-0">
                      <p className="font-bold text-ink">Заказ #{order.id}</p>
                      <p className="text-xs text-ink-faint mt-0.5">{new Date(order.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${st.color} hidden sm:inline`}>{st.label}</span>
                    <span className="font-display font-bold text-ink">{Number(order.total_price).toLocaleString()} ₽</span>
                    <svg className={`w-4 h-4 text-ink-faint transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-line overflow-hidden">
                      <div className="p-5 flex flex-col gap-2">
                        <span className={`px-3 py-1.5 rounded-xl text-xs font-semibold self-start sm:hidden ${st.color}`}>{st.label}</span>
                        {order.recipient_name && <p className="text-sm text-ink-faint flex items-center gap-1.5"><Icon name="user" className="w-4 h-4 shrink-0" /> {order.recipient_name}{order.recipient_phone ? `, ${order.recipient_phone}` : ''}</p>}
                        {order.delivery_address && <p className="text-sm text-ink-faint flex items-center gap-1.5"><Icon name="pin" className="w-4 h-4 shrink-0" /> {DELIVERY_LABELS[order.delivery_method] ?? 'Доставка'}: {order.delivery_address}</p>}
                        {order.payment_method && <p className="text-sm text-ink-faint flex items-center gap-1.5"><Icon name="card" className="w-4 h-4 shrink-0" /> {PAYMENT_LABELS[order.payment_method] ?? 'Оплата'}</p>}
                        <div className="mt-1">
                          {(order.items ?? []).map((item) => (
                            <div key={item.id} className="flex justify-between text-sm py-2 border-b border-line last:border-0">
                              <span className="text-ink-soft">
                                {item.product_name}
                                {(item.size || item.color) && (
                                  <span className="text-ink-faint"> · {[item.size, item.color].filter(Boolean).join(' / ')}</span>
                                )}
                              </span>
                              <span className="text-ink-faint shrink-0 ml-4">{item.quantity} шт. × {Number(item.price_at_purchase).toLocaleString()} ₽</span>
                            </div>
                          ))}
                        </div>

                        {/* Чек 54-ФЗ (Ф26) - эмуляция, виден владельцу заказа */}
                        {order.receipt && (
                          <div className="mt-3">
                            <ReceiptCard receipt={order.receipt} />
                          </div>
                        )}

                        {/* Действия по заказу */}
                        <div className="flex flex-wrap gap-2 mt-3">
                          <button
                            onClick={() => handleRepeat(order)}
                            disabled={busy}
                            className="text-xs font-semibold bg-ink text-white px-4 py-2 rounded-xl hover:bg-ink/90 transition disabled:opacity-50"
                          >
                            {busy ? 'Добавляем...' : 'Повторить заказ'}
                          </button>
                          {CANCELLABLE.includes(order.status) && (
                            <button
                              onClick={() => handleCancel(order)}
                              disabled={busy}
                              className="text-xs font-semibold text-danger border border-danger/30 px-4 py-2 rounded-xl hover:bg-danger/10 transition disabled:opacity-50"
                            >
                              Отменить заказ
                            </button>
                          )}
                          {order.status === 'delivered' && (
                            <button
                              onClick={() => navigate(`/profile?tab=returns&order=${order.id}`)}
                              className="text-xs font-semibold text-ink-faint border border-line-strong px-4 py-2 rounded-xl hover:bg-surface transition"
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
