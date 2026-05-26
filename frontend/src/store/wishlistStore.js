import { create } from 'zustand'

const useWishlistStore = create((set, get) => ({
  items: JSON.parse(localStorage.getItem('wishlist') || '[]'),

  toggle: (product) => {
    const items = get().items
    const exists = items.find(i => i.id === product.id)
    const newItems = exists
      ? items.filter(i => i.id !== product.id)
      : [...items, product]
    localStorage.setItem('wishlist', JSON.stringify(newItems))
    set({ items: newItems })
  },

  isLiked: (id) => get().items.some(i => i.id === id),
}))

export default useWishlistStore