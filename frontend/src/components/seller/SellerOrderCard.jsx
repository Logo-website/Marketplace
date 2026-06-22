import { motion, AnimatePresence } from 'framer-motion'
import { orderStatusInfo } from '../../utils/orderStatus'
import OrderDetail from './OrderDetail'

// Строка заказа в реестре продавца (Ф14): №, дата, статус-бейдж, кол-во своих
// позиций, сумма своих позиций. Клик раскрывает детали (OrderDetail) - данные
// уже пришли в списке (один сериализатор на list/detail), без доп. запроса.
//
// Props:
//   order, expanded, onToggle(id), busy, onStatus(order, to), onCancel(order).

function rub(value) {
  return `${Number(value).toLocaleString('ru-RU')} ₽`
}

export default function SellerOrderCard({ order, expanded, onToggle, busy, onStatus, onCancel }) {
  const st = orderStatusInfo(order.status)
  const itemsCount = (order.items || []).length

  return (
    <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
      <button
        onClick={() => onToggle(order.id)}
        className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-gray-50 transition gap-3 text-left"
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-lg border border-gray-100 shrink-0">
            {st.icon}
          </div>
          <div className="min-w-0">
            <p className="font-bold text-gray-800">Заказ #{order.id}</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {new Date(order.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
              {' · '}{itemsCount} поз.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${st.color} hidden sm:inline`}>{st.label}</span>
          <span className="font-black text-gray-900 whitespace-nowrap">{rub(order.seller_total)}</span>
          <svg className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {/* Статус-бейдж для мобильного (в шапке скрыт на узком экране) */}
            <div className="px-5 pt-3 sm:hidden">
              <span className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${st.color}`}>{st.label}</span>
            </div>
            <OrderDetail order={order} busy={busy} onStatus={onStatus} onCancel={onCancel} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
