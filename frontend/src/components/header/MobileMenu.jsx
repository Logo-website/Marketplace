import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MOTION_FAST } from '../../lib/motion'
import useDropdown from '../../hooks/useDropdown'
import CatalogMenu from './CatalogMenu'
import CitySelector from './CitySelector'

// Бургер-меню (узел 4.2, адаптивность). На узких экранах прячет каталог, город
// и входы за одну кнопку. Механизм закрытия (клик-вне + Esc, инвариант «открыт
// максимум один дроп») переиспользует общий useDropdown. Видно только на
// мобильном (родитель прячет на md+ через классы).
export default function MobileMenu({ isAuthenticated, user, onLogout }) {
  const { open, toggle, setOpen, ref } = useDropdown()
  const close = () => setOpen(false)

  return (
    <div className="relative md:hidden" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label="Меню"
        className="flex items-center justify-center w-10 h-10 rounded-full text-ink-soft hover:text-accent hover:bg-surface transition-colors"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {open ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          )}
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={MOTION_FAST}
            className="absolute top-full right-0 mt-2 w-[min(92vw,22rem)] bg-card rounded-2xl shadow-lift border border-line p-4 z-50 max-h-[80vh] overflow-y-auto flex flex-col gap-4"
          >
            <CatalogMenu embedded onNavigate={close} />

            {/* Бренды (Ф21, узел 1.22) - вход в каталог марок */}
            <Link
              to="/brands"
              onClick={close}
              className="px-4 py-2.5 rounded-xl bg-surface text-ink text-sm font-semibold text-center hover:bg-accent-soft hover:text-accent transition-colors"
            >
              Бренды
            </Link>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-widest text-ink-faint">Город</span>
              <CitySelector onNavigate={close} />
            </div>

            <div className="flex flex-col gap-2 border-t border-line pt-4">
              {/* Продавец -> кабинет; покупатель/гость -> онбординг /sell (Ф11).
                  Админу «стать продавцом» не предлагаем (таблица ролей 4.1). */}
              {user?.role !== 'admin' && (
                <Link
                  to={user?.role === 'seller' ? '/seller' : '/sell'}
                  onClick={close}
                  className="px-4 py-2.5 rounded-xl bg-ink text-white text-sm font-semibold text-center hover:bg-accent transition-colors"
                >
                  {user?.role === 'seller' ? 'Кабинет продавца' : 'Продавать'}
                </Link>
              )}

              {isAuthenticated ? (
                <>
                  <Link
                    to="/profile"
                    onClick={close}
                    className="px-4 py-2.5 rounded-xl bg-surface text-ink text-sm font-semibold text-center hover:bg-accent-soft hover:text-accent transition-colors"
                  >
                    Профиль
                  </Link>
                  <button
                    type="button"
                    onClick={() => { close(); onLogout?.() }}
                    className="px-4 py-2.5 rounded-xl text-ink-soft text-sm font-medium text-center hover:bg-surface transition-colors"
                  >
                    Выйти
                  </button>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    to="/login"
                    onClick={close}
                    className="px-4 py-2.5 rounded-xl border border-line text-ink text-sm font-semibold text-center hover:border-line-strong transition-colors"
                  >
                    Войти
                  </Link>
                  <Link
                    to="/register"
                    onClick={close}
                    className="px-4 py-2.5 rounded-xl bg-ink text-white text-sm font-bold text-center hover:bg-accent transition-colors"
                  >
                    Регистрация
                  </Link>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
