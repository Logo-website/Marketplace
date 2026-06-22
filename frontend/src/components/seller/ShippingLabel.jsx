// Печать этикетки заказа (Ф14, узел 2.6) - УЧЕБНАЯ ЗАГЛУШКА.
// Реальные накладные/этикетки перевозчика и схема FBO/FBS - Ф32 (план 4.5).
// Печатаем браузером (window.print) в отдельном окне, без PDF-библиотек.

import { toast } from '../../store/toastStore'

// Экранирование UGC (имя/адрес/комментарий покупателя) перед вставкой в HTML -
// эти поля приходят от покупателя, при прямой интерполяции был бы XSS (часть 9).
function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function rub(value) {
  return `${Number(value).toLocaleString('ru-RU')} ₽`
}

export function printShippingLabel(order) {
  const win = window.open('', '_blank', 'width=480,height=640')
  // Блокировщик попапов / нет окружения окна - не падаем, но честно сообщаем,
  // а не молча проглатываем клик (граничный случай: печать недоступна, план §6).
  if (!win) {
    toast.error('Разрешите всплывающие окна, чтобы распечатать этикетку')
    return false
  }

  const date = new Date(order.created_at).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
  const rows = (order.items || []).map((it) => {
    const variant = [it.size, it.color].filter(Boolean).join(' / ')
    const name = esc(it.product_name) + (variant ? ` <span class="muted">· ${esc(variant)}</span>` : '')
    return `<tr><td>${name}</td><td class="qty">${Number(it.quantity)} шт.</td></tr>`
  }).join('')

  win.document.write(`<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><title>Этикетка заказа #${Number(order.id)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, sans-serif; color: #111; padding: 32px; margin: 0; }
  .stub { font-size: 11px; color: #b91c1c; border: 1px dashed #fca5a5; border-radius: 8px; padding: 6px 10px; margin-bottom: 20px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .date { color: #666; font-size: 13px; margin: 0 0 20px; }
  .block { margin-bottom: 16px; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #999; margin-bottom: 2px; }
  .value { font-size: 14px; white-space: pre-wrap; word-break: break-word; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  td { padding: 6px 0; border-bottom: 1px solid #eee; font-size: 14px; vertical-align: top; }
  .qty { text-align: right; white-space: nowrap; color: #555; }
  .muted { color: #999; }
  .total { margin-top: 12px; font-weight: 700; font-size: 15px; display: flex; justify-content: space-between; }
  @media print { .stub { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head>
<body>
  <div class="stub">Учебная заглушка. Реальные этикетки перевозчика - в фазе Ф32.</div>
  <h1>Заказ #${Number(order.id)}</h1>
  <p class="date">${esc(date)}</p>
  <div class="block"><div class="label">Получатель</div><div class="value">${esc(order.buyer_name)}</div></div>
  <div class="block"><div class="label">Адрес доставки</div><div class="value">${esc(order.delivery_address)}</div></div>
  ${order.comment ? `<div class="block"><div class="label">Комментарий</div><div class="value">${esc(order.comment)}</div></div>` : ''}
  <div class="block"><div class="label">Состав</div>
    <table><tbody>${rows}</tbody></table>
    <div class="total"><span>Сумма позиций</span><span>${rub(order.seller_total)}</span></div>
  </div>
</body></html>`)
  win.document.close()
  win.focus()
  win.print()
  return true
}
