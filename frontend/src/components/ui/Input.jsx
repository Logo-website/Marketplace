import { forwardRef } from 'react'

// Поле ввода-примитив. Заземлено на повторяющийся inline-паттерн полей
// (например, profile/ProfileField). Цвета - только токены; фокус-ring даёт
// глобальный :focus-visible из index.css, здесь не дублируем. Все нативные
// пропсы input (type/value/onChange/placeholder/name...) пробрасываются.
//   label - опц. подпись над полем; error - опц. текст ошибки (красит границу).
const Input = forwardRef(function Input({ label, error, className = '', id, ...props }, ref) {
  const inputId = id || props.name
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-xs font-semibold text-ink-faint uppercase tracking-wide">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`w-full rounded-xl border bg-surface px-3 py-2.5 text-sm font-medium text-ink placeholder:text-ink-faint transition-colors focus:bg-card ${
          error ? 'border-danger' : 'border-line focus:border-line-strong'
        } ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
})

export default Input
