import { create } from 'zustand'
import api from '../api'
import useNotificationStore from './notificationStore'

const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('access_token'),

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