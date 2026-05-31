import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import useCartStore from '../store/cartStore'
import useAuthStore from '../store/authStore'
import useWishlistStore from '../store/wishlistStore'
import api from '../api'
import ProductCard from '../components/ProductCard'

export default function CartPage() {
  const { items, total, fetchCart, removeFromCart, clearCart } = useCartStore()
  const { isAuthenticated } = useAuthStore()
  const { toggle, isLiked } = useWishlistStore()
  const [purchasedProducts, setPurchasedProducts] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [selectedItems, setSelectedItems] = useState([])
  const navigate = useNavigate()

  const recentlyViewed = JSON.parse(localStorage.getItem('recently_viewed') || '[]')

  useEffect(() => {
    fetchCart()
    if (isAuthenticated) {
      fetchPurchased()
      fetchRecommendations()
    }
  }, [])

  useEffect(() => {
    if (items.length > 0) setSelectedItems(items.map(i => i.product_id))
  }, [items])

  const fetchPurchased = async () => {
    try {
      const res = await api.get('/orders/')
      const productIds = [...new Set(
        res.data.results.flatMap(order => order.items.map(item => item.product))
      )].slice(0, 10)
      const products = await Promise.all(
        productIds.map(id => api.get(`/products/${id}/`).then(r => r.data).catch(() => null))
      )
      setPurchasedProducts(products.filter(Boolean))
    } catch {
      setPurchasedProducts([])
    }
  }

  const fetchRecommendations = async () => {
    try {
      const res = await api.get('/products/recommendations/')
      setRecommendations(Array.isArray(res.data) ? res.data : [])
    } catch {
      setRecommendations([])
    }
  }

  const handleSelectAll = () => {
    setSelectedItems(selectedItems.length === items.length ? [] : items.map(i => i.product_id))
  }

  const handleSelectItem = (id) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const handleQuantityChange = async (item, delta) => {
    const newQty = item.quantity + delta
    if (newQty < 1) return
    try {
      await removeFromCart(item.product_id)
      await api.post('/cart/', { product_id: item.product_id, quantity: newQty })
      await fetchCart()
    } catch (e) {
      console.error(e)
    }
  }

  const selectedTotal = items
    .filter(i => selectedItems.includes(i.product_id))
    .reduce((sum, i) => sum + Number(i.total), 0)

  const SectionBlock = ({ title, products, limit }) =>
    products.length > 0 ? (
      <div className="bg-white rounded-2xl p-6 border border-gray-100 mt-4">
        <h2 className="text-base font-bold text-gray-900 mb-4">{title}</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {(limit ? products.slice(0, limit) : products).map((product, i) => (
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
    ) : null

  if (items.length === 0) return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl p-10 border border-gray-100 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
          </div>
          <h1 className="text-xl font-black text-gray-900 mb-1">Корзина пуста</h1>
          <p className="text-gray-400 text-sm mb-5">Воспользуйтесь поиском, чтобы найти всё, что нужно</p>
          <motion.button
            onClick={() => navigate('/')}
            className="bg-[#111] text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-800 transition"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Перейти в каталог
          </motion.button>
        </div>
        <SectionBlock title="Вы смотрели" products={recentlyViewed} limit={10} />
        <SectionBlock title="Вы покупали" products={purchasedProducts} />
        <SectionBlock title="Рекомендуем" products={recommendations} />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto px-4 py-8">

        <motion.h1
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-2xl font-black text-gray-900 mb-6 flex items-baseline gap-3"
        >
          Корзина
          <span className="text-base font-medium text-gray-400">{items.length} товара</span>
        </motion.h1>

        <div className="flex flex-col lg:flex-row gap-5">

          {/* Товары */}
          <div className="flex-1">

            {/* Выбрать все */}
            <div className="bg-white rounded-2xl px-5 py-3.5 border border-gray-100 mb-3 flex items-center justify-between">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={selectedItems.length === items.length && items.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 accent-indigo-600 rounded"
                />
                <span className="text-sm font-semibold text-gray-700">
                  Выбрать все ({items.length})
                </span>
              </label>
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                Доступны для заказа
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <AnimatePresence>
                {items.map((item, i) => (
                  <motion.div
                    key={item.product_id}
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 16, height: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="bg-white rounded-2xl p-4 border border-gray-100"
                  >
                    <div className="flex items-start gap-4">

                      {/* Чекбокс */}
                      <input
                        type="checkbox"
                        checked={selectedItems.includes(item.product_id)}
                        onChange={() => handleSelectItem(item.product_id)}
                        className="w-4 h-4 accent-indigo-600 mt-3 shrink-0 rounded"
                      />

                      {/* Картинка */}
                      <div className="w-24 h-24 bg-gray-50 rounded-xl shrink-0 overflow-hidden flex items-center justify-center border border-gray-100">
                        {item.image ? (
                          <img src={item.image} alt={item.name} className="w-full h-full object-contain"
                            onError={(e) => { e.target.style.display = 'none' }} />
                        ) : (
                          <svg className="w-8 h-8 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
                          </svg>
                        )}
                      </div>

                      {/* Инфо */}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm line-clamp-2 mb-2 leading-snug">{item.name}</p>

                        <p className="text-xl font-black text-gray-900 mb-1">
                          {(Number(item.price) * item.quantity).toLocaleString()} ₽
                        </p>
                        <p className="text-xs text-gray-400 mb-3">
                          {Number(item.price).toLocaleString()} ₽ × {item.quantity} шт.
                        </p>

                        {/* Количество */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden w-fit">
                            <motion.button
                              onClick={() => handleQuantityChange(item, -1)}
                              className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 transition text-gray-600 font-bold"
                              whileTap={{ scale: 0.85 }}
                            >−</motion.button>
                            <span className="w-9 text-center text-sm font-bold text-gray-800">{item.quantity}</span>
                            <motion.button
                              onClick={() => handleQuantityChange(item, 1)}
                              className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 transition text-gray-600 font-bold"
                              whileTap={{ scale: 0.85 }}
                            >+</motion.button>
                          </div>
                        </div>

                        {/* Действия */}
                        <div className="flex items-center gap-3">
                          <motion.button
                            onClick={() => toggle(item)}
                            className={`flex items-center gap-1.5 text-xs font-medium transition ${
                              isLiked(item.product_id) ? 'text-red-500' : 'text-gray-400 hover:text-gray-600'
                            }`}
                            whileTap={{ scale: 0.9 }}
                          >
                            <svg className="w-4 h-4" fill={isLiked(item.product_id) ? 'currentColor' : 'none'}
                              stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                            </svg>
                            В избранное
                          </motion.button>
                          <span className="text-gray-200">·</span>
                          <motion.button
                            onClick={() => removeFromCart(item.product_id)}
                            className="text-xs text-gray-400 hover:text-red-500 transition font-medium"
                            whileTap={{ scale: 0.9 }}
                          >
                            Удалить
                          </motion.button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>

          {/* Оформление */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:w-80 shrink-0"
          >
            <div className="bg-white rounded-2xl p-6 border border-gray-100 sticky top-24">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Ваш заказ</h2>
              <p className="text-xs text-gray-400 mb-4">
                Выбрано {selectedItems.length} из {items.length} товаров
              </p>

              <div className="flex justify-between items-baseline mb-5">
                <span className="text-gray-500 text-sm">Итого</span>
                <span className="text-2xl font-black text-gray-900">
                  {selectedTotal.toLocaleString()} ₽
                </span>
              </div>

              <motion.button
                onClick={() => navigate('/checkout')}
                disabled={selectedItems.length === 0}
                className="w-full bg-[#111] text-white py-3.5 rounded-xl font-bold text-sm hover:bg-gray-800 transition disabled:opacity-40 mb-4"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                Перейти к оформлению →
              </motion.button>

              <div className="flex items-center gap-2 text-xs text-gray-400">
                <svg className="w-4 h-4 text-emerald-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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