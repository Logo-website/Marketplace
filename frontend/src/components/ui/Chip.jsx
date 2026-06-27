// Чип - выбираемая пилюля (фильтры, теги, быстрые переключатели). Цвета - токены.
//   active - выбранное состояние: мягкая зелёная подложка accent-soft.
// Рендерится как <button>; поведение/пропсы обычной кнопки (onClick...).
export default function Chip({ active = false, className = '', children, ...props }) {
  const cls = active
    ? 'bg-accent-soft text-accent border-accent/30'
    : 'bg-card text-ink-soft border-line hover:border-line-strong'
  return (
    <button
      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${cls} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
