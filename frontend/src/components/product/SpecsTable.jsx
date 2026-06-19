// Таблица характеристик товара (Ф4) - data-driven от attributes.specs.
// specs - словарь { 'Состав': '...', 'Уход': '...', 'Страна': '...', ... }.
// Рендерим только непустые пары; нет specs или все пустые -> блок не виден
// (правило репо №1, не выдумываем характеристики). Наполнение - Ф12/сид.
export default function SpecsTable({ specs }) {
  if (!specs || typeof specs !== 'object') return null

  const rows = Object.entries(specs).filter(
    ([key, value]) => key && value != null && String(value).trim() !== ''
  )
  if (rows.length === 0) return null

  return (
    <dl className="divide-y divide-gray-100">
      {rows.map(([key, value]) => (
        <div key={key} className="flex justify-between gap-4 py-3 text-sm">
          <dt className="text-gray-400 shrink-0">{key}</dt>
          <dd className="text-gray-800 font-medium text-right">{String(value)}</dd>
        </div>
      ))}
    </dl>
  )
}
