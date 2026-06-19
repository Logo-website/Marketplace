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

  // size - выбранный размер (Ф4). Передаём forward-совместимо: бэкенд-корзина
  // пока кейится только product_id и size игнорирует. Полное хранение размера
  // в строке корзины/заказа и per-size остатки - Ф8/Ф12 (план Ф4, решение 2),
  // здесь контракт Ф8 не ломаем.
  addToCart: async (productId, quantity = 1, size = null) => {
    const payload = { product_id: productId, quantity }
    if (size) payload.size = size
    await api.post('/cart/', payload)
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