import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import useCartStore, { itemKey } from '../store/cartStore'
import useAuthStore from '../store/authStore'
import useWishlistStore from '../store/wishlistStore'
import useRecentlyViewedStore from '../store/recentlyViewedStore'
import { toast } from '../store/toastStore'
import api from '../api'
import ProductCard from '../components/ProductCard'
import EmptyState from '../components/states/EmptyState'

// Лента товаров в подвале корзины (смотрели / покупали / рекомендуем).
// Объявлена на уровне модуля, не внутри CartPage: компонент, созданный во время
// рендера родителя, пересоздаётся каждый ререндер и теряет состояние/анимации
// своего поддерева (react-hooks: компоненты не создаём во время рендера).
function SectionBlock({ title, products, limit }) {
  if (!products.length) return null
  const list = limit ? products.slice(0, limit) : products
  return (
    <div className="bg-card rounded-2xl p-6 border border-line mt-4">
      <h2 className="text-base font-display font-bold text-ink mb-4">{title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {list.map((product, i) => (
          <motion.div
            key={product.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.02 }}
          >
            <ProductCard product={product} />
          </motion.div>
        ))}
      </div>
    </div>
  )
}

export default function CartPage() {
  const { items, fetchCart, setItemQty, removeItem } = useCartStore()
  const { isAuthenticated } = useAuthStore()
  const { toggle, isLiked } = useWishlistStore()
  // Лента «недавно смотрели» через стор с try/catch - битый localStorage не
  // валит страницу (раньше тут был голый JSON.parse).
  const recentlyViewed = useRecentlyViewedStore((s) => s.items)
  const [purchasedProducts, setPurchasedProducts] = useState([])
  const [recommendations, setRecommendations] = useState([])
  // Выбор товаров: храним СНЯТЫЕ ключи (product|size|color), остальное выбрано
  // по умолчанию. Выбор выводится из items на лету, без синхронизации в эффекте.
  const [deselected, setDeselected] = useState(() => new Set())
  const [promo, setPromo] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    fetchCart()
    if (!isAuthenticated) return

    const loadPurchased = async () => {
      try {
        const res = await api.get('/orders/')
        const productIds = [...new Set(
          res.data.results.flatMap(order => order.items.map(item => item.product))
        )].filter(Boolean).slice(0, 10)
        const products = await Promise.all(
          productIds.map(id => api.get(`/products/${id}/`).then(r => r.data).catch(() => null))
        )
        setPurchasedProducts(products.filter(Boolean))
      } catch {
        setPurchasedProducts([])
      }
    }

    const loadRecommendations = async () => {
      try {
        const res = await api.get('/products/recommendations/')
        setRecommendations(Array.isArray(res.data) ? res.data : [])
      } catch {
        setRecommendations([])
      }
    }

    loadPurchased()
    loadRecommendations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Выбранные = все строки, кроме снятых вручную. Идентичность строки -
  // составной ключ (один товар в двух размерах = две независимые строки).
  const selectedKeys = items.map(itemKey).filter((k) => !deselected.has(k))
  const allSelected = selectedKeys.length === items.length && items.length > 0

  const handleSelectAll = () => {
    setDeselected(allSelected ? new Set(items.map(itemKey)) : new Set())
  }

  const handleSelectItem = (key) => {
    setDeselected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Установка точного количества (set, не delete+post): при отказе по стоку
  // позиция не теряется - показываем тост, количество остаётся прежним.
  const handleQuantityChange = async (item, delta) => {
    const newQty = item.quantity + delta
    if (newQty < 1) return
    if (newQty > item.stock) {
      toast.error(`Доступно только ${item.stock} шт.`)
      return
    }
    try {
      await setItemQty(item, newQty)
    } catch (e) {
      toast.error(e.response?.data?.error || 'Не удалось изменить количество')
    }
  }

  const handleRemove = async (item) => {
    try {
      await removeItem(item)
    } catch {
      toast.error('Не удалось удалить товар')
    }
  }

  // Перенести в избранное = добавить в вишлист И убрать из корзины (раньше был
  // только toggle - «копировать», а не «перенести»). Если уже в избранном -
  // не снимаем лайк (toggle убрал бы), просто переносим.
  const moveToWishlist = async (item) => {
    if (!isLiked(item.product_id)) {
      toggle({
        id: item.product_id,
        name: item.name,
        price: item.price,
        stock: item.stock,
        images: item.image ? [{ image_url: item.image }] : [],
      })
    }
    try {
      await removeItem(item)
      toast.success('Перенесено в избранное')
    } catch {
      toast.error('Не удалось перенести')
    }
  }

  const applyPromo = () => {
    if (!promo.trim()) return
    // Логика промокодов - Ф27. Здесь поле-вход, как требует карта (узел 1.8).
    toast.info('Промокоды скоро будут доступны')
  }

  const handleCheckout = () => {
    if (selectedKeys.length === 0) return
    // Гость: вход просим только на оформлении (Ф8/Ф9). После входа гостевая
    // корзина сливается, пользователь возвращается за покупкой.
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    // Честный выбор позиций: на чекаут уходят ровно выбранные строки (Ф8 этап 5).
    navigate('/checkout', { state: { selectedKeys } })
  }

  const selectedTotal = items
    .filter((i) => selectedKeys.includes(itemKey(i)))
    .reduce((sum, i) => sum + Number(i.total), 0)

  // Группировка по продавцам (узел 1.8): товары разных магазинов - разные
  // под-блоки. Подготовка к FBO/FBS (Ф32); сейчас визуальная группировка без
  // разной стоимости доставки (единая упрощённая схема, оговорка карты).
  const groups = []
  const groupIndex = {}
  for (const item of items) {
    const gk = item.seller_id != null ? `s${item.seller_id}` : `n:${item.seller_name || ''}`
    if (!(gk in groupIndex)) {
      groupIndex[gk] = groups.length
      groups.push({ key: gk, sellerName: item.seller_name || 'Магазин', items: [] })
    }
    groups[groupIndex[gk]].items.push(item)
  }

  if (items.length === 0) return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <EmptyState
          icon={
            <svg className="w-8 h-8 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
          }
          title="Корзина пуста"
          subtitle="Воспользуйтесь поиском, чтобы найти всё, что нужно"
          action={{ label: 'Перейти в каталог', onClick: () => navigate('/') }}
        />
        <SectionBlock title="Вы смотрели" products={recentlyViewed} limit={10} />
        <SectionBlock title="Вы покупали" products={purchasedProducts} />
        <SectionBlock title="Рекомендуем" products={recommendations} />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-7xl mx-auto px-4 py-8">

        <motion.h1
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-display font-bold text-ink mb-6 flex items-baseline gap-3"
        >
          Корзина
          <span className="text-base font-medium text-ink-faint">{items.length} товара</span>
        </motion.h1>

        <div className="flex flex-col lg:flex-row gap-5">

          {/* Товары */}
          <div className="flex-1">

            {/* Выбрать все */}
            <div className="bg-card rounded-2xl px-5 py-3.5 border border-line mb-3 flex items-center justify-between">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={handleSelectAll}
                  className="w-4 h-4 accent-accent rounded"
                />
                <span className="text-sm font-semibold text-ink-soft">
                  Выбрать все ({items.length})
                </span>
              </label>
              <div className="flex items-center gap-1.5 text-xs text-success font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Доступны для заказа
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {groups.map((group) => (
                <div key={group.key} className="flex flex-col gap-3">

                  {/* Заголовок-витрина продавца (видно, если продавцов больше одного) */}
                  {groups.length > 1 && (
                    <div className="flex items-center gap-2 px-1 pt-1">
                      <svg className="w-4 h-4 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h18v4H3V3zm0 4l1 13a1 1 0 001 1h12a1 1 0 001-1l1-13" />
                      </svg>
                      <span className="text-sm font-bold text-ink-soft line-clamp-1">{group.sellerName}</span>
                    </div>
                  )}

                  <AnimatePresence>
                    {group.items.map((item, i) => {
                      const key = itemKey(item)
                      return (
                        <motion.div
                          key={key}
                          initial={{ opacity: 0, x: -16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 16, height: 0 }}
                          transition={{ delay: i * 0.04 }}
                          className="bg-card rounded-2xl p-4 border border-line"
                        >
                          <div className="flex items-start gap-4">

                            {/* Чекбокс */}
                            <input
                              type="checkbox"
                              checked={!deselected.has(key)}
                              onChange={() => handleSelectItem(key)}
                              className="w-4 h-4 accent-accent mt-3 shrink-0 rounded"
                            />

                            {/* Картинка */}
                            <div className="w-24 h-24 bg-surface rounded-xl shrink-0 overflow-hidden flex items-center justify-center border border-line">
                              {item.image ? (
                                <img src={item.image} alt={item.name} className="w-full h-full object-contain"
                                  onError={(e) => { e.target.style.display = 'none' }} />
                              ) : (
                                <svg className="w-8 h-8 text-line-strong" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
                                </svg>
                              )}
                            </div>

                            {/* Инфо */}
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-ink text-sm line-clamp-2 mb-1 leading-snug">{item.name}</p>

                              {/* Вариант: размер / цвет (если у товара есть) */}
                              {(item.size || item.color) && (
                                <p className="text-xs text-ink-faint mb-2">
                                  {item.size && <span>Размер: <span className="text-ink-soft font-medium">{item.size}</span></span>}
                                  {item.size && item.color && <span className="mx-1.5">·</span>}
                                  {item.color && <span>Цвет: <span className="text-ink-soft font-medium">{item.color}</span></span>}
                                </p>
                              )}

                              <p className="text-xl font-display font-bold text-ink mb-1">
                                {(Number(item.price) * item.quantity).toLocaleString()} ₽
                              </p>
                              <p className="text-xs text-ink-faint mb-3">
                                {Number(item.price).toLocaleString()} ₽ × {item.quantity} шт.
                                {item.stock <= 5 && <span className="text-warning ml-2">осталось {item.stock}</span>}
                              </p>

                              {/* Количество */}
                              <div className="flex items-center gap-3 mb-3">
                                <div className="flex items-center border border-line rounded-xl overflow-hidden w-fit">
                                  <motion.button
                                    onClick={() => handleQuantityChange(item, -1)}
                                    disabled={item.quantity <= 1}
                                    className="w-9 h-9 flex items-center justify-center hover:bg-surface transition text-ink-soft font-bold disabled:opacity-30"
                                    whileTap={{ scale: 0.85 }}
                                  >−</motion.button>
                                  <span className="w-9 text-center text-sm font-bold text-ink">{item.quantity}</span>
                                  <motion.button
                                    onClick={() => handleQuantityChange(item, 1)}
                                    disabled={item.quantity >= item.stock}
                                    className="w-9 h-9 flex items-center justify-center hover:bg-surface transition text-ink-soft font-bold disabled:opacity-30"
                                    whileTap={{ scale: 0.85 }}
                                  >+</motion.button>
                                </div>
                              </div>

                              {/* Действия */}
                              <div className="flex items-center gap-3">
                                <motion.button
                                  onClick={() => moveToWishlist(item)}
                                  className="flex items-center gap-1.5 text-xs font-medium text-ink-faint hover:text-accent transition"
                                  whileTap={{ scale: 0.9 }}
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                                  </svg>
                                  В избранное
                                </motion.button>
                                <span className="text-line-strong">·</span>
                                <motion.button
                                  onClick={() => handleRemove(item)}
                                  className="text-xs text-ink-faint hover:text-danger transition font-medium"
                                  whileTap={{ scale: 0.9 }}
                                >
                                  Удалить
                                </motion.button>
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>

          {/* Оформление */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:w-80 shrink-0"
          >
            <div className="bg-card rounded-2xl p-6 border border-line sticky top-24">
              <h2 className="text-sm font-bold text-ink uppercase tracking-wide mb-4">Ваш заказ</h2>
              <p className="text-xs text-ink-faint mb-4">
                Выбрано {selectedKeys.length} из {items.length} товаров
              </p>

              {/* Промокод - поле-вход (логика в Ф27) */}
              <div className="flex gap-2 mb-4">
                <input
                  type="text"
                  value={promo}
                  onChange={(e) => setPromo(e.target.value)}
                  placeholder="Промокод"
                  className="flex-1 min-w-0 border border-line rounded-xl px-3 py-2.5 text-sm transition bg-surface focus:bg-card focus:border-line-strong"
                />
                <button
                  onClick={applyPromo}
                  className="px-4 py-2.5 rounded-xl bg-surface text-ink-soft text-sm font-semibold hover:bg-line transition shrink-0"
                >
                  Применить
                </button>
              </div>

              <div className="flex justify-between items-baseline mb-5">
                <span className="text-ink-soft text-sm">Итого</span>
                <span className="text-2xl font-display font-bold text-ink">
                  {selectedTotal.toLocaleString()} ₽
                </span>
              </div>

              <motion.button
                onClick={handleCheckout}
                disabled={selectedKeys.length === 0}
                className="w-full bg-ink text-white py-3.5 rounded-xl font-bold text-sm hover:bg-ink/90 transition disabled:opacity-40 mb-4"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                Перейти к оформлению →
              </motion.button>

              <div className="flex items-center gap-2 text-xs text-ink-faint">
                <svg className="w-4 h-4 text-success shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Безопасная оплата и возврат
              </div>
            </div>
          </motion.div>
        </div>

        {/* Секции */}
        <SectionBlock title="Вы смотрели" products={recentlyViewed} limit={10} />
        <SectionBlock title="Вы покупали" products={purchasedProducts} />
        <SectionBlock title="Рекомендуем" products={recommendations} limit={100} />

      </div>
    </div>
  )
}
