import { create } from 'zustand'
import api from '../api'

const useAuthStore = create((set) => ({
  user: null,
  isAuthenticated: !!localStorage.getItem('access_token'),

  login: async (email, password) => {
    const res = await api.post('/auth/login/', { email, password })
    localStorage.setItem('access_token', res.data.access)
    localStorage.setItem('refresh_token', res.data.refresh)
    set({ isAuthenticated: true })
    const profile = await api.get('/auth/profile/')
    set({ user: profile.data })
  },

  logout: () => {
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    set({ user: null, isAuthenticated: false })
  },

  fetchProfile: async () => {
    try {
      const res = await api.get('/auth/profile/')
      set({ user: res.data })
    } catch {
      set({ user: null, isAuthenticated: false })
    }
  }
}))

export default useAuthStore