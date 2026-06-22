// Бейдж статуса товара в реестре продавца (Ф13, узел 2.2). Data-driven:
// рисует любой пришедший статус, незнакомый - нейтральным бейджем с сырым
// значением (не падает, граничный случай плана 7).
const STATUS_MAP = {
  active: { label: 'Активен', cls: 'bg-emerald-50 text-emerald-600' },
  moderation: { label: 'На модерации', cls: 'bg-amber-50 text-amber-600' },
  hidden: { label: 'Скрыт', cls: 'bg-gray-100 text-gray-500' },
  rejected: { label: 'Отклонён', cls: 'bg-red-50 text-red-600' },
  draft: { label: 'Черновик', cls: 'bg-gray-100 text-gray-400' },
}

export default function StatusBadge({ status, className = '' }) {
  const s = STATUS_MAP[status] || { label: status || '—', cls: 'bg-gray-100 text-gray-500' }
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-lg whitespace-nowrap ${s.cls} ${className}`}>
      {s.label}
    </span>
  )
}
