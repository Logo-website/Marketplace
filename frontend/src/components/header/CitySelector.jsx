import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect } from 'react'
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

  // Если в localStorage не было города - зафиксируем дефолт при первом заходе.
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) localStorage.setItem(STORAGE_KEY, city)
  }, [city])

  const select = (c) => {
    setCity(c)
    localStorage.setItem(STORAGE_KEY, c)
    setOpen(false)
    onNavigate?.()
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-2 px-3 py-3 rounded-xl bg-white/10 hover:bg-white/15 transition text-sm text-white font-medium"
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
            transition={{ duration: 0.15 }}
            className="absolute top-full right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50 max-h-[60vh] overflow-y-auto"
          >
            <p className="px-4 pt-3 pb-1 text-xs font-bold uppercase tracking-widest text-gray-400">
              Ваш город
            </p>
            {CITIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => select(c)}
                className={`w-full text-left px-4 py-2.5 text-sm transition hover:bg-gray-50 ${
                  c === city ? 'font-bold text-[#111]' : 'text-gray-600'
                }`}
              >
                {c}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
