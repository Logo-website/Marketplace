// Бейдж/пилюля статуса. Заземлён на существующий seller/StatusBadge.jsx
// (тот можно перевести на этот примитив в фазе кабинетов). Цвета - токены.
//   tone: neutral | accent | success | warning | danger | ink
//   ink - чернильный бейдж (напр. «Осталось N» на карточке, бренд-гайд §1).
const TONES = {
  neutral: 'bg-surface text-ink-soft',
  accent:  'bg-accent-soft text-accent',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger:  'bg-danger/10 text-danger',
  ink:     'bg-ink text-white',
}

export default function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-lg whitespace-nowrap ${TONES[tone] || TONES.neutral} ${className}`}>
      {children}
    </span>
  )
}
