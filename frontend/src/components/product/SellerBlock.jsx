import { toast } from '../../store/toastStore'

// Блок продавца на карточке (Ф4). Показывает имя магазина (seller_name из API -
// публичное имя, не email, S17). Витрина бренда (Ф20), чат с продавцом (Ф24) и
// рейтинг продавца (Ф20) - forward-узлы: до своих фаз ссылки - заглушки (тост
// «скоро»), не «мёртвые ссылки» и не выдуманный рейтинг (правило репо №1).
export default function SellerBlock({ sellerName }) {
  if (!sellerName) return null

  const soon = (what) => toast.info(`${what} появится позже`)

  return (
    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-sm font-bold text-gray-600 shrink-0">
          {sellerName[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-gray-400">Продаёт</p>
          <p className="text-sm font-semibold text-gray-800 truncate">{sellerName}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => soon('Витрина бренда')}
          className="text-xs font-semibold text-gray-600 hover:text-[#111] border border-gray-200 rounded-lg px-3 py-1.5 transition"
        >
          Витрина
        </button>
        <button
          onClick={() => soon('Чат с продавцом')}
          className="text-xs font-semibold text-white bg-[#111] hover:bg-gray-800 rounded-lg px-3 py-1.5 transition"
        >
          Написать
        </button>
      </div>
    </div>
  )
}
