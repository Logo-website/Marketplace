// Чек 54-ФЗ (Ф26) - ЭМУЛЯЦИЯ. Один компонент для экрана «спасибо» (Ф9) и деталей
// заказа (Ф10). Явная плашка «не фискальный документ» - честная заглушка, не обман
// (§4.5/§8). Реквизиты псевдо-фискальные, наружу ничего не уходит.
export default function ReceiptCard({ receipt }) {
  if (!receipt) return null
  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-bold text-gray-800">Кассовый чек</span>
        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-100 rounded px-1.5 py-0.5">
          Эмуляция
        </span>
      </div>
      <div className="flex flex-col gap-1.5 text-xs text-gray-500">
        <div className="flex justify-between"><span>ФН</span><span className="font-mono text-gray-700">{receipt.fn_number}</span></div>
        <div className="flex justify-between"><span>ФД</span><span className="font-mono text-gray-700">{receipt.fd_number}</span></div>
        <div className="flex justify-between"><span>ФП</span><span className="font-mono text-gray-700">{receipt.fiscal_sign}</span></div>
        <div className="flex justify-between"><span>Сумма</span><span className="font-semibold text-gray-700">{Number(receipt.total).toLocaleString()} ₽</span></div>
      </div>
      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
        Учебная эмуляция чека, не является фискальным документом. Реальная онлайн-касса
        (54-ФЗ) в проекте не подключена.
      </p>
    </div>
  )
}
