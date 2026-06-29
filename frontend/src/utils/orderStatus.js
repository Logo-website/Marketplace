// Палитра статусов заказа для кабинета продавца (Ф14). Те же значения, что
// видит покупатель в профиле, - единый визуальный язык статуса заказа.
// Незнакомый статус рисуем нейтрально (data-driven, не падаем).
// tone - цвет единого line-глифа заказа в кружке (паттерн OrdersTab Ф9): статус
// читается «с одного взгляда», без emoji (бренд-гайд §4).
export const ORDER_STATUS_CONFIG = {
  created:    { label: 'Новый',       color: 'bg-surface text-ink-soft',        tone: 'text-ink-faint' },
  paid:       { label: 'Принят',      color: 'bg-accent-soft text-accent',      tone: 'text-accent' },
  processing: { label: 'Собирается',  color: 'bg-warning/10 text-warning',      tone: 'text-warning' },
  shipped:    { label: 'В доставке',  color: 'bg-accent-soft text-accent',      tone: 'text-accent' },
  delivered:  { label: 'Доставлен',   color: 'bg-success/10 text-success',      tone: 'text-success' },
  cancelled:  { label: 'Отменён',     color: 'bg-danger/10 text-danger',        tone: 'text-danger' },
}

export function orderStatusInfo(status) {
  return ORDER_STATUS_CONFIG[status] || { label: status || '—', color: 'bg-surface text-ink-faint', tone: 'text-ink-faint' }
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
