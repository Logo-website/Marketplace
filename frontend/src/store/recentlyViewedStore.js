import { create } from 'zustand'

// Лента «вы недавно смотрели» (узел 1.12) - клиентская, как wishlistStore:
// работает и для гостя, не требует бэкенд-эндпоинта (план Ф7, решение 3.2.3).
// ClickHouse-лог просмотров остаётся отдельно для аналитики (Ф33), не для
// этой ленты.
//
// Отличие от wishlistStore: localStorage обёрнут в try/catch - приватный
// режим/переполнение квоты не роняют приложение (граничный случай плана 5),
// деградация в память.

const KEY = 'recently_viewed'
const LIMIT = 20

// Храним только поля, нужные ProductCard, - не весь тяжёлый detail-объект
// товара (20 штук в localStorage), но достаточно чтобы карточка отрисовалась
// без дозагрузки.
function toCardShape(p) {
  return {
    id: p.id,
    name: p.name,
    price: p.price,
    images: p.images,
    stock: p.stock,
    rating: p.rating,
    reviews_count: p.reviews_count,
    attributes: p.attributes,
  }
}

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save(items) {
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch {
    // Приватный режим / превышена квота - живём с лентой в памяти, не падаем.
  }
}

const useRecentlyViewedStore = create((set, get) => ({
  items: load(),

  // Добавить просмотр: поднять товар наверх без дублей, обрезать до LIMIT.
  add: (product) => {
    if (!product?.id) return
    const filtered = get().items.filter((x) => x.id !== product.id)
    const next = [toCardShape(product), ...filtered].slice(0, LIMIT)
    save(next)
    set({ items: next })
  },
}))

export default useRecentlyViewedStore
