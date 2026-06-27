// Размеры с остатком по каждому (Ф12, узел 2.3). Контракт attributes.sizes:
// [{ label, stock }] - available сервер проставляет сам (stock>0) для Ф4.
// stock:0 -> размер сохраняется, но в карточке (Ф4) неактивен.
const INPUT = 'border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition bg-surface focus:bg-card'

export default function SizeStockEditor({ value, onChange }) {
  const rows = Array.isArray(value) ? value : []

  const update = (i, patch) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  const add = () => onChange([...rows, { label: '', stock: '' }])
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i))

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className={`${INPUT} flex-1`}
            placeholder="Размер (S, M, 42…)"
            value={row.label}
            onChange={(e) => update(i, { label: e.target.value })}
          />
          <input
            className={`${INPUT} w-28`}
            type="number"
            min="0"
            placeholder="Остаток"
            value={row.stock}
            onChange={(e) => update(i, { stock: e.target.value })}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="shrink-0 w-9 h-9 rounded-xl text-danger hover:bg-danger/10 transition flex items-center justify-center"
            aria-label="Удалить размер"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="self-start text-sm text-accent font-semibold hover:underline"
      >
        + Добавить размер
      </button>
    </div>
  )
}
