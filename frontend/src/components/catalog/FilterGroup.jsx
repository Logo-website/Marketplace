// Одна группа фильтра: заголовок + список переключаемых значений. Презентационный.
// Переиспользуется для цены, бренда, рейтинга, наличия - все группы выглядят
// одинаково, отличаются только подписями и данными (data-driven из фасетов).

// Один пункт-переключатель: подпись слева, счётчик справа, выделение выбранного.
export function FilterOption({ label, count, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors text-left ${
        selected ? 'bg-ink text-white' : 'text-ink-soft hover:bg-surface'
      }`}
    >
      <span className="truncate">{label}</span>
      {count != null && (
        <span className={`text-xs ml-2 shrink-0 ${selected ? 'text-white/60' : 'text-ink-faint'}`}>
          {count}
        </span>
      )}
    </button>
  )
}

export default function FilterGroup({ title, children }) {
  return (
    <div className="mb-5 last:mb-0">
      <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-2">{title}</p>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}
