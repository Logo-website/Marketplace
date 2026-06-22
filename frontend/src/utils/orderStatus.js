// Палитра статусов заказа для кабинета продавца (Ф14). Те же значения, что
// видит покупатель в профиле, - единый визуальный язык статуса заказа.
// Незнакомый статус рисуем нейтрально (data-driven, не падаем).
export const ORDER_STATUS_CONFIG = {
  created:    { label: 'Новый',       color: 'bg-gray-100 text-gray-600',       icon: '🕐' },
  paid:       { label: 'Принят',      color: 'bg-blue-100 text-blue-600',       icon: '✔️' },
  processing: { label: 'Собирается',  color: 'bg-amber-100 text-amber-600',     icon: '📦' },
  shipped:    { label: 'В доставке',  color: 'bg-purple-100 text-purple-600',   icon: '🚚' },
  delivered:  { label: 'Доставлен',   color: 'bg-emerald-100 text-emerald-600', icon: '✅' },
  cancelled:  { label: 'Отменён',     color: 'bg-red-100 text-red-600',         icon: '❌' },
}

export function orderStatusInfo(status) {
  return ORDER_STATUS_CONFIG[status] || { label: status || '—', color: 'bg-gray-100 text-gray-500', icon: '•' }
}

// Кнопки смены статуса по текущему статусу (план 4.3). Маппинг на существующую
// state-machine PATCH /orders/{id}/status/ - кнопки в языке продавца, переходы
// не меняем. Отмена (created/paid -> cancelled) - отдельная кнопка с подтверждением.
export const STATUS_ACTIONS = {
  created:    [{ to: 'paid', label: 'Принять заказ' }],
  paid:       [{ to: 'processing', label: 'Собрать' }],
  processing: [{ to: 'shipped', label: 'Передать в доставку' }],
  shipped:    [{ to: 'delivered', label: 'Отметить доставленным' }],
}

// Отмена доступна продавцу только до отправки (как и покупателю в OrderCancelView /
// valid_transitions смены-статуса).
export const SELLER_CANCELLABLE = ['created', 'paid']
