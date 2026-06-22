import { STATUS_ACTIONS, SELLER_CANCELLABLE } from '../../utils/orderStatus'
import { printShippingLabel } from './ShippingLabel'

// Детали заказа в кабинете продавца (Ф14, узел 2.6): получатель, адрес,
// комментарий, СВОИ позиции и их сумма + кнопки смены статуса.
// Все поля покупателя (имя/адрес/комментарий) - текст в JSX, React экранирует
// (XSS-защита, часть 9). E-mail/телефон бэкенд не отдаёт (план 4.4).
//
// Props:
//   order        - объект SellerOrderSerializer (свои items, seller_total, can_update_status);
//   busy         - true, пока идёт запрос смены статуса по этому заказу;
//   onStatus(order, newStatus) - смена статуса (родитель шлёт PATCH);
//   onCancel(order)            - запрос отмены (родитель открывает подтверждение).

function rub(value) {
  return `${Number(value).toLocaleString('ru-RU')} ₽`
}

export default function OrderDetail({ order, busy, onStatus, onCancel }) {
  const actions = STATUS_ACTIONS[order.status] || []
  const canCancel = SELLER_CANCELLABLE.includes(order.status)

  return (
    <div className="p-5 border-t border-gray-100 flex flex-col gap-3">
      {/* Данные покупателя для исполнения */}
      <div className="flex flex-col gap-1.5 text-sm">
        <p className="text-gray-600"><span className="text-gray-400">Получатель:</span> {order.buyer_name || '—'}</p>
        <p className="text-gray-600 break-words"><span className="text-gray-400">Адрес:</span> {order.delivery_address || '—'}</p>
        {order.comment && (
          <p className="text-gray-600 break-words"><span className="text-gray-400">Комментарий:</span> {order.comment}</p>
        )}
      </div>

      {/* Свои позиции */}
      <div className="mt-1">
        {(order.items || []).map((item) => (
          <div key={item.id} className="flex justify-between text-sm py-2 border-b border-gray-50 last:border-0 gap-4">
            <span className="text-gray-700 break-words">
              {item.product_name}
              {(item.size || item.color) && (
                <span className="text-gray-400"> · {[item.size, item.color].filter(Boolean).join(' / ')}</span>
              )}
            </span>
            <span className="text-gray-500 shrink-0 whitespace-nowrap">
              {item.quantity} шт. × {rub(item.price_at_purchase)}
            </span>
          </div>
        ))}
        <div className="flex justify-between font-bold text-gray-900 text-sm mt-2">
          <span>Сумма позиций</span>
          <span>{rub(order.seller_total)}</span>
        </div>
      </div>

      {/* Действия */}
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {order.can_update_status ? (
          <>
            {actions.map((a) => (
              <button
                key={a.to}
                onClick={() => onStatus(order, a.to)}
                disabled={busy}
                className="text-xs font-semibold bg-[#111] text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition disabled:opacity-50"
              >
                {a.label}
              </button>
            ))}
            {canCancel && (
              <button
                onClick={() => onCancel(order)}
                disabled={busy}
                className="text-xs font-semibold text-red-500 border border-red-200 px-4 py-2 rounded-xl hover:bg-red-50 transition disabled:opacity-50"
              >
                Отменить
              </button>
            )}
          </>
        ) : (
          // Смешанный заказ: статус ведёт площадка, продавцу read-only (план 4.2).
          <span className="text-xs font-medium text-amber-600 bg-amber-50 px-3 py-2 rounded-xl">
            Совместный заказ - статус ведёт площадка
          </span>
        )}
        <button
          onClick={() => printShippingLabel(order)}
          className="text-xs font-semibold text-gray-600 border border-gray-200 px-4 py-2 rounded-xl hover:bg-gray-50 transition"
        >
          Печать этикетки
        </button>
      </div>
    </div>
  )
}
