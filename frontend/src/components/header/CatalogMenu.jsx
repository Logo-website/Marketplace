import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../../api'
import useAsyncData from '../../hooks/useAsyncData'
import useDropdown from '../../hooks/useDropdown'
import { Skeleton } from '../states/Skeleton'
import ErrorState from '../states/ErrorState'

// Каталог-меню (узел 1.1): кнопка «Каталог» раскрывает дерево категорий.
// Клик по категории ведёт на /catalog/<id> - экран выдачи категории (Ф2).
// Дерево грузится одним запросом (categories отдаёт вложенные children, Ф1)
// и кэшируется сервером на час.
//
// onNavigate - колбэк после клика по категории (закрыть мобильное меню).
// embedded=true рендерит содержимое без кнопки-триггера и дропдауна
// (для бургера на мобильном).
export default function CatalogMenu({ onNavigate, embedded = false }) {
  const { open, toggle, setOpen, ref } = useDropdown()

  const { data, status, retry } = useAsyncData(
    (signal) =>
      api.get('/products/categories/', { signal }).then((r) =>
        Array.isArray(r.data) ? r.data : r.data?.results ?? []
      ),
    []
  )
  const categories = data ?? []

  const handleClick = () => {
    setOpen(false)
    onNavigate?.()
  }

  const tree = (
    <div className="max-h-[70vh] overflow-y-auto">
      {status === 'loading' ? (
        <div className="flex flex-col gap-3 p-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-5 rounded-full w-2/3" />
          ))}
        </div>
      ) : status === 'error' ? (
        <ErrorState
          className="!py-8 !border-0 !rounded-none"
          subtitle="Не удалось загрузить категории."
          onRetry={retry}
        />
      ) : categories.length === 0 ? (
        <p className="text-sm text-ink-faint text-center py-8 px-4">
          Категории пока не настроены
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 p-5">
          {categories.map((cat) => (
            <div key={cat.id}>
              <Link
                to={`/catalog/${cat.id}`}
                onClick={handleClick}
                className="block text-sm font-bold text-ink hover:text-accent transition-colors"
              >
                {cat.name}
              </Link>
              {cat.children?.length > 0 && (
                <ul className="mt-2 flex flex-col gap-1.5">
                  {cat.children.map((sub) => (
                    <li key={sub.id}>
                      <Link
                        to={`/catalog/${sub.id}`}
                        onClick={handleClick}
                        className="block text-sm text-ink-soft hover:text-ink transition-colors"
                      >
                        {sub.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )

  // Встроенный режим (мобильный бургер) - без кнопки и абсолютного дропа.
  if (embedded) {
    return (
      <div>
        <p className="px-1 pb-2 text-xs font-bold uppercase tracking-widest text-ink-faint">
          Каталог
        </p>
        <div className="rounded-2xl border border-line bg-card">{tree}</div>
      </div>
    )
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-ink hover:bg-surface transition-colors font-semibold"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span className="hidden lg:block">Каталог</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute top-full left-0 mt-2 w-[min(90vw,32rem)] bg-card rounded-2xl shadow-lift border border-line overflow-hidden z-50"
          >
            {tree}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
