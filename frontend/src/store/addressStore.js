import { create } from 'zustand'
import api from '../api'

// Адреса доставки (Ф10). В отличие от cartStore гостевого режима нет - адреса
// живут только на сервере под авторизацией. Список держим в сторе, чтобы и
// кабинет (Ф10), и будущий чекаут (Ф9) брали его из одного места.
const useAddressStore = create((set, get) => ({
  items: [],
  status: 'idle', // idle | loading | ready | error

  fetch: async () => {
    set({ status: 'loading' })
    try {
      const res = await api.get('/auth/addresses/')
      const rows = Array.isArray(res.data) ? res.data : res.data.results || []
      set({ items: rows, status: 'ready' })
    } catch {
      set({ status: 'error' })
    }
  },

  // create/update/remove/setDefault пробрасывают ошибку наверх - форма покажет
  // её пользователю; после успеха перечитываем список (дефолт пересчитан на бэке).
  create: async (payload) => {
    await api.post('/auth/addresses/', payload)
    await get().fetch()
  },

  update: async (id, payload) => {
    await api.put(`/auth/addresses/${id}/`, payload)
    await get().fetch()
  },

  remove: async (id) => {
    await api.delete(`/auth/addresses/${id}/`)
    await get().fetch()
  },

  setDefault: async (id) => {
    await api.patch(`/auth/addresses/${id}/`, { is_default: true })
    await get().fetch()
  },
}))

export default useAddressStore
