import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
import { MOTION_FAST } from '../../lib/motion'
import useDropdown from '../../hooks/useDropdown'
import { CITIES, DEFAULT_CITY } from '../../data/cities'

const STORAGE_KEY = 'city'

function loadCity() {
  const saved = localStorage.getItem(STORAGE_KEY)
  // Неизвестный город в localStorage (сменился справочник / ручная правка) ->
  // откат к дефолту, без краша (граничный случай из плана Ф1).
  return saved && CITIES.includes(saved) ? saved : DEFAULT_CITY
}

// Выбор города (узел 1.1). Справочник - фикстура, выбор хранится в
// localStorage. На сроки/ПВЗ повлияет в Ф9 (чекаут); здесь - только выбор и
// отображение. onNavigate закрывает мобильное меню после выбора.
export default function CitySelector({ onNavigate }) {
  const { open, toggle, setOpen, ref } = useDropdown()
  const [city, setCity] = useState(loadCity)
  const [query, setQuery] = useState('')

  // Если в localStorage не было города - зафиксируем дефолт при первом заходе.
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, city)
  }, [city])

  // Закрыли список - сбрасываем строку поиска, чтобы при следующем открытии
  // показать весь справочник заново. Делаем при рендере (паттерн React
  // "adjust state on change"), а не в эффекте: setState в эффекте ругает линтер
  // и даёт лишний ререндер.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (!open) setQuery('')
  }

  const select = (c) => {
    setCity(c)
    localStorage.setItem(STORAGE_KEY, c)
    setOpen(false)
    onNavigate?.()
  }

  const q = query.trim().toLowerCase()
  const filtered = q ? CITIES.filter((c) => c.toLowerCase().includes(q)) : CITIES

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-ink-soft hover:text-ink hover:bg-surface transition-colors font-medium"
      >
        <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.828 0l-4.243-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="hidden xl:block max-w-[8rem] truncate">{city}</span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={MOTION_FAST}
            className="absolute top-full right-0 mt-2 w-56 bg-card rounded-2xl shadow-lift border border-line overflow-hidden z-50 max-h-[60vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-card border-b border-line">
              <p className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-widest text-ink-faint">
                Ваш город
              </p>
              <div className="px-3 pt-1 pb-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Поиск города"
                  aria-label="Поиск города"
                  autoFocus
                  className="w-full px-3 py-2 text-sm rounded-lg bg-surface border border-line text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent transition-colors"
                />
              </div>
            </div>
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-faint">Ничего не найдено</p>
            ) : (
              filtered.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => select(c)}
                  className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-surface ${
                    c === city ? 'font-bold text-ink' : 'text-ink-soft'
                  }`}
                >
                  {c}
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
