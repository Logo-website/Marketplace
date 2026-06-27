import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'

// Навигация кабинета (Ф10). Адаптивная (план 3.3.3): на десктопе вертикальный
// сайдбар, на мобильном - горизонтальный скролл-таб-бар, навигация не ломается.
//
// Props:
//   user     - текущий пользователь (для карточки профиля)
//   tabs     - [{ id, label, icon, link? }]
//   active   - id активной вкладки
//   onSelect - (id) => void
export default function ProfileSidebar({ user, tabs, active, onSelect }) {
  const roleLabel = user?.role === 'buyer' ? 'Покупатель' : user?.role === 'seller' ? 'Продавец' : 'Администратор'

  const itemBtn = (tab, mobile) => {
    if (tab.link) {
      return (
        <Link
          key={tab.id}
          to={tab.link}
          className={mobile
            ? 'shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-ink-faint bg-card border border-line whitespace-nowrap'
            : 'flex items-center gap-3 px-4 py-3 text-ink-faint hover:text-ink hover:bg-surface transition border-b border-line last:border-0'}
        >
          <span>{tab.icon}</span>
          <span className={mobile ? '' : 'text-sm font-medium'}>{tab.label}</span>
        </Link>
      )
    }
    const isActive = active === tab.id
    return (
      <button
        key={tab.id}
        onClick={() => onSelect(tab.id)}
        className={mobile
          ? `shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${isActive ? 'bg-ink text-white' : 'text-ink-faint bg-card border border-line'}`
          : `w-full flex items-center gap-3 px-4 py-3 transition border-b border-line last:border-0 text-left text-sm font-medium ${isActive ? 'bg-ink text-white' : 'text-ink-faint hover:text-ink hover:bg-surface'}`}
      >
        <span className={isActive ? 'opacity-100' : 'opacity-80'}>{tab.icon}</span>
        <span>{tab.label}</span>
      </button>
    )
  }

  return (
    <>
      {/* Десктоп - вертикальный сайдбар */}
      <motion.aside
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="hidden lg:flex w-64 shrink-0 sticky top-24 flex-col gap-3"
      >
        <div className="bg-ink rounded-2xl p-5 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(circle at 80% 20%, var(--color-accent) 0%, transparent 60%)' }} />
          <div className="relative flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent to-accent-hover flex items-center justify-center text-xl font-black text-white shrink-0">
              {user?.username?.[0]?.toUpperCase() ?? 'U'}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-white text-sm truncate">{user?.username ?? '—'}</p>
              <p className="text-ink-faint text-xs truncate">{user?.email ?? ''}</p>
            </div>
          </div>
          <div className="relative mt-4 pt-4 border-t border-white/10">
            <span className="text-xs text-ink-faint">{roleLabel}</span>
          </div>
        </div>

        <nav className="bg-card rounded-2xl border border-line overflow-hidden">
          {tabs.map((t) => itemBtn(t, false))}
        </nav>
      </motion.aside>

      {/* Мобайл - горизонтальный таб-бар */}
      <div className="lg:hidden -mx-4 px-4 mb-4 overflow-x-auto scrollbar-hide">
        <div className="flex gap-2 w-max">
          {tabs.map((t) => itemBtn(t, true))}
        </div>
      </div>
    </>
  )
}
