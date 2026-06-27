// Характеристики товара ключ-значение (Ф12, узел 2.3). Контракт attributes.specs
// - словарь { 'Состав': 'хлопок 100%', ... }, который читает Ф4 (SpecsTable).
// Редактируем как список пар (порядок предсказуем), в словарь собираем при сабмите.
const INPUT = 'border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition bg-surface focus:bg-card'

// Подсказки по типовым характеристикам одежды (узел 2.3: состав/уход/страна/сезон/крой).
const SUGGESTED_KEYS = ['Состав', 'Уход', 'Страна', 'Сезон', 'Крой']

export default function SpecsEditor({ value, onChange }) {
  const rows = Array.isArray(value) ? value : []

  const update = (i, patch) => {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)))
  }
  const add = (key = '') => onChange([...rows, { key, val: '' }])
  const remove = (i) => onChange(rows.filter((_, idx) => idx !== i))

  return (
    <div className="flex flex-col gap-2">
      {rows.map((row, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className={`${INPUT} w-1/3`}
            list="spec-keys"
            placeholder="Характеристика"
            value={row.key}
            onChange={(e) => update(i, { key: e.target.value })}
          />
          <input
            className={`${INPUT} flex-1`}
            placeholder="Значение"
            value={row.val}
            onChange={(e) => update(i, { val: e.target.value })}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="shrink-0 w-9 h-9 rounded-xl text-danger hover:bg-danger/10 transition flex items-center justify-center"
            aria-label="Удалить характеристику"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
      <datalist id="spec-keys">
        {SUGGESTED_KEYS.map((k) => <option key={k} value={k} />)}
      </datalist>
      <button
        type="button"
        onClick={() => add()}
        className="self-start text-sm text-accent font-semibold hover:underline"
      >
        + Добавить характеристику
      </button>
    </div>
  )
}
