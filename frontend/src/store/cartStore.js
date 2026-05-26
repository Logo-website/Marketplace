import { create } from 'zustand'
import api from '../api'

const useCartStore = create((set) => ({
  items: [],
  total: '0',

  fetchCart: async () => {
    try {
      const res = await api.get('/cart/')
      set({ items: res.data.items, total: res.data.total })
    } catch {
      set({ items: [], total: '0' })
    }
  },

  addToCart: async (productId, quantity = 1) => {
    await api.post('/cart/', { product_id: productId, quantity })
    const res = await api.get('/cart/')
    set({ items: res.data.items, total: res.data.total })
  },

  removeFromCart: async (productId) => {
    await api.delete('/cart/', { data: { product_id: productId } })
    const res = await api.get('/cart/')
    set({ items: res.data.items, total: res.data.total })
  },

  clearCart: async () => {
    await api.delete('/cart/')
    set({ items: [], total: '0' })
  }
}))

export default useCartStore