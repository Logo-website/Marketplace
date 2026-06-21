import { create } from 'zustand'
import api from '../api'
import useNotificationStore from './notificationStore'
import useCartStore from './cartStore'

const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('access_token'),

  // Единый вход: ставим токены -> профиль -> сливаем гостевую корзину в
  // серверную (Ф8). Один action вместо дублирования в трёх verify-обработчиках
  // (Login/Register/Forgot), чтобы слияние корзины не размазалось по страницам.
  login: async (tokens) => {
    localStorage.setItem('access_token', tokens.access)
    localStorage.setItem('refresh_token', tokens.refresh)
    set({ isAuthenticated: true })
    await useAuthStore.getState().fetchProfile()
    await useCartStore.getState().mergeGuestCart()
  },

  logout: async () => {
    try {
      const refresh = localStorage.getItem('refresh_token')
      if (refresh) {
        await api.post('/auth/logout/', { refresh })
      }
    } catch {
      // даже если запрос упал — всё равно выходим
    } finally {
      localStorage.removeItem('access_token')
      localStorage.removeItem('refresh_token')
      useNotificationStore.getState().disconnect()
      set({ user: null, isAuthenticated: false })
    }
  },

  fetchProfile: async () => {
    try {
      const res = await api.get('/auth/profile/')
      set({ user: res.data, isAuthenticated: true })
    } catch {
      set({ user: null, isAuthenticated: false })
    }
  },
}))

export default useAuthStore