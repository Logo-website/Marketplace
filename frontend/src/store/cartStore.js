import { create } from 'zustand'
import api from '../api'
import { toast } from './toastStore'

// Гостевая корзина (Ф8): источник правды - localStorage до входа, сервер после.
// Роль определяем по наличию токена (как authStore/интерсептор), без связи
// сторов между собой.
const GUEST_KEY = 'guest_cart'
const isAuth = () => !!localStorage.getItem('access_token')

// Идентичность строки корзины = товар + вариант. Один товар в двух размерах =
// две строки. Гость и сервер несут одни и те же поля - ключ считается одинаково.
export const itemKey = (i) => `${i.product_id}|${i.size || ''}|${i.color || ''}`

function readGuestCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_KEY) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return [] // битый JSON -> пустая корзина, не белый экран
  }
}

function writeGuestCart(lines) {
  localStorage.setItem(GUEST_KEY, JSON.stringify(lines))
}

// Собирает позиции гостевой корзины: товары одним запросом (?ids=), итог на
// клиенте. Протухшие (снятые/недоступные) товары тихо убирает + тост.
// Сетевую ошибку пробрасывает - вызывающий оставит прежнее состояние.
async function buildGuestItems(lines) {
  const ids = [...new Set(lines.map((l) => l.product_id))]
  const res = await api.get(`/products/?ids=${ids.join(',')}`)
  const products = Array.isArray(res.data) ? res.data : res.data.results || []
  const byId = Object.fromEntries(products.map((p) => [p.id, p]))

  const items = []
  const kept = []
  let total = 0
  let dropped = false
  for (const l of lines) {
    const p = byId[l.product_id]
    if (!p) {
      dropped = true
      continue
    }
    kept.push(l)
    const itemTotal = Number(p.price) * l.quantity
    total += itemTotal
    const image = p.images?.length ? p.images[0].image_url || p.images[0].image : null
    items.push({
      product_id: p.id,
      size: l.size || '',
      color: l.color || '',
      name: p.name,
      price: String(p.price),
      quantity: l.quantity,
      total: String(itemTotal),
      image,
      stock: p.stock,
      seller_id: null,
      seller_name: p.seller_name || '',
    })
  }
  if (dropped) {
    writeGuestCart(kept)
    toast.error('Часть товаров недоступна и удалена из корзины')
  }
  return { items, total: String(total) }
}

const useCartStore = create((set, get) => ({
  items: [],
  total: '0',

  fetchCart: async () => {
    if (isAuth()) {
      try {
        const res = await api.get('/cart/')
        set({ items: res.data.items, total: res.data.total })
      } catch {
        set({ items: [], total: '0' })
      }
      return
    }
    const lines = readGuestCart()
    if (!lines.length) {
      set({ items: [], total: '0' })
      return
    }
    try {
      const { items, total } = await buildGuestItems(lines)
      set({ items, total })
    } catch {
      // сеть упала - оставляем текущее состояние, не затираем корзину
    }
  },

  // size/color - выбранный вариант (Ф4). Гость пишет в localStorage,
  // авторизованный - на сервер. Суммирует количество для того же товар+вариант.
  addToCart: async (productId, quantity = 1, size = null, color = null) => {
    const s = size || ''
    const c = color || ''
    if (isAuth()) {
      await api.post('/cart/', { product_id: productId, quantity, size: s, color: c })
      await get().fetchCart()
      return
    }
    const lines = readGuestCart()
    const k = `${productId}|${s}|${c}`
    const existing = lines.find((l) => itemKey(l) === k)
    if (existing) existing.quantity += quantity
    else lines.push({ product_id: productId, size: s, color: c, quantity })
    writeGuestCart(lines)
    await get().fetchCart()
  },

  // Установка точного количества (кнопки +/-). Ошибку стока (сервер 400)
  // пробрасываем - CartPage покажет тост и оставит прежнее количество.
  setItemQty: async (item, quantity) => {
    if (quantity < 1) return
    if (isAuth()) {
      await api.put('/cart/', {
        product_id: item.product_id,
        quantity,
        size: item.size || '',
        color: item.color || '',
      })
      await get().fetchCart()
      return
    }
    const lines = readGuestCart()
    const line = lines.find((l) => itemKey(l) === itemKey(item))
    if (!line) return
    line.quantity = item.stock ? Math.min(quantity, item.stock) : quantity
    writeGuestCart(lines)
    await get().fetchCart()
  },

  removeItem: async (item) => {
    if (isAuth()) {
      await api.delete('/cart/', {
        data: { product_id: item.product_id, size: item.size || '', color: item.color || '' },
      })
      await get().fetchCart()
      return
    }
    const lines = readGuestCart().filter((l) => itemKey(l) !== itemKey(item))
    writeGuestCart(lines)
    await get().fetchCart()
  },

  clearCart: async () => {
    if (isAuth()) {
      await api.delete('/cart/')
    } else {
      localStorage.removeItem(GUEST_KEY)
    }
    set({ items: [], total: '0' })
  },

  // Слияние гостевой корзины в серверную при входе (Ф8). Сервер суммирует и
  // обрезает по стоку, недоступное пропускает. После успеха гостевую чистим.
  mergeGuestCart: async () => {
    const lines = readGuestCart()
    if (!lines.length) {
      await get().fetchCart()
      return
    }
    try {
      const res = await api.post('/cart/merge/', { items: lines })
      localStorage.removeItem(GUEST_KEY)
      set({ items: res.data.items, total: res.data.total })
    } catch {
      // слияние не удалось - гостевую не теряем, грузим серверную корзину
      await get().fetchCart()
    }
  },
}))

export default useCartStore
