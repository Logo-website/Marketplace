// Бейдж статуса товара в реестре продавца (Ф13, узел 2.2). Data-driven:
// рисует любой пришедший статус, незнакомый - нейтральным бейджем с сырым
// значением (не падает, граничный случай плана 7).
const STATUS_MAP = {
  active: { label: 'Активен', cls: 'bg-success/10 text-success' },
  moderation: { label: 'На модерации', cls: 'bg-warning/10 text-warning' },
  hidden: { label: 'Скрыт', cls: 'bg-surface text-ink-faint' },
  rejected: { label: 'Отклонён', cls: 'bg-danger/10 text-danger' },
  draft: { label: 'Черновик', cls: 'bg-surface text-ink-faint' },
}

export default function StatusBadge({ status, className = '' }) {
  const s = STATUS_MAP[status] || { label: status || '—', cls: 'bg-surface text-ink-faint' }
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-lg whitespace-nowrap ${s.cls} ${className}`}>
      {s.label}
    </span>
  )
}
