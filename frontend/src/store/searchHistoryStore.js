import { create } from 'zustand'

// История поисковых запросов - клиентские данные в localStorage (по образцу
// wishlistStore). Серверу знать историю не нужно. Ограничиваем длину очереди,
// дедуплицируем и не пишем пустое (граничные случаи из плана Ф1).
const STORAGE_KEY = 'search_history'
const MAX = 8

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((q) => typeof q === 'string') : []
  } catch {
    // битый JSON в localStorage - откат к пустой истории, без краша
    return []
  }
}

const useSearchHistoryStore = create((set, get) => ({
  items: load(),

  add: (query) => {
    const q = (query || '').trim()
    if (!q) return // пустые/пробельные запросы не пишем
    // дедуп: свежий запрос всплывает наверх, дублей нет
    const next = [q, ...get().items.filter((i) => i.toLowerCase() !== q.toLowerCase())].slice(0, MAX)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    set({ items: next })
  },

  clear: () => {
    localStorage.removeItem(STORAGE_KEY)
    set({ items: [] })
  },
}))

export default useSearchHistoryStore
