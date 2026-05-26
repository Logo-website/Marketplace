import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import useCartStore from '../store/cartStore'
import useAuthStore from '../store/authStore'
import api from '../api'
import ProductCard from '../components/ProductCard'

export default function CartPage() {
  const { items, total, fetchCart, removeFromCart, clearCart } = useCartStore()
  const { isAuthenticated } = useAuthStore()
  const [address, setAddress] = useState('')
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [purchasedProducts, setPurchasedProducts] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const navigate = useNavigate()

  const recentlyViewed = JSON.parse(localStorage.getItem('recently_viewed') || '[]')

  useEffect(() => {
    fetchCart()
    if (isAuthenticated) {
      fetchPurchased()
      fetchRecommendations()
    }
  }, [])

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
      setRecommendations(Array.isArray(res.data) ? res.data.slice(0, 10) : [])
    } catch {
      setRecommendations([])
    }
  }

  const handleOrder = async () => {
    if (!address) {
      alert('Укажите адрес доставки')
      return
    }
    setLoading(true)
    try {
      await api.post('/orders/from-cart/', {
        delivery_address: address,
        comment: comment
      })
      await clearCart()
      setSuccess(true)
      setTimeout(() => navigate('/profile'), 2500)
    } catch (err) {
      alert(err.response?.data?.error || 'Ошибка при оформлении заказа')
    } finally {
      setLoading(false)
    }
  }

  if (success) return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center"
      >
        <div className="text-8xl mb-4">🎉</div>
        <h2 className="text-2xl font-black text-gray-800 mb-2">Заказ оформлен!</h2>
        <p className="text-gray-400">Перенаправляем в личный кабинет...</p>
      </motion.div>
    </div>
  )

  if (items.length === 0) return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto px-4 py-8">

        <div className="bg-white rounded-2xl p-8 border border-gray-100 mb-6">
          <h1 className="text-2xl font-black text-gray-800 mb-1">Корзина пуста</h1>
          <p className="text-gray-400 text-sm mb-4">Воспользуйтесь поиском, чтобы найти всё, что нужно</p>
          <motion.button
            onClick={() => navigate('/')}
            className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-indigo-700 transition"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Начать покупки
          </motion.button>
        </div>

        {/* Вы смотрели */}
        {recentlyViewed.length > 0 && (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Вы смотрели</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {recentlyViewed.slice(0, 10).map((product, i) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Вы покупали */}
        {purchasedProducts.length > 0 && (
          <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Вы покупали</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {purchasedProducts.map((product, i) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Рекомендуем */}
        {recommendations.length > 0 && (
          <div className="bg-white rounded-2xl p-6 border border-gray-100">
            <h2 className="text-lg font-bold text-gray-800 mb-4">Рекомендуем</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {recommendations.map((product, i) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-black text-gray-800 mb-8"
        >
          Корзина
          <span className="ml-3 text-lg font-medium text-gray-400">{items.length} товара</span>
        </motion.h1>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 flex flex-col gap-3">
            <AnimatePresence>
              {items.map((item, i) => (
                <motion.div
                  key={item.product_id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, height: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-white rounded-2xl p-4 flex items-center gap-4 shadow-sm border border-gray-100"
                >
                  <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center shrink-0 text-2xl">📦</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm line-clamp-2">{item.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{item.quantity} шт. × {Number(item.price).toLocaleString()} ₽</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-gray-900">{Number(item.total).toLocaleString()} ₽</p>
                    <motion.button
                      onClick={() => removeFromCart(item.product_id)}
                      className="text-xs text-red-400 hover:text-red-600 mt-1 transition"
                      whileTap={{ scale: 0.9 }}
                    >
                      Удалить
                    </motion.button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:w-80 shrink-0"
          >
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 sticky top-24">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Оформление заказа</h2>
              <div className="flex justify-between items-center text-2xl font-black text-gray-900 mb-6">
                <span>Итого:</span>
                <span className="text-indigo-600">{Number(total).toLocaleString()} ₽</span>
              </div>
              <div className="flex flex-col gap-3 mb-4">
                <input
                  type="text"
                  placeholder="Адрес доставки *"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition"
                />
                <textarea
                  placeholder="Комментарий (необязательно)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition resize-none"
                  rows={3}
                />
              </div>
              <motion.button
                onClick={handleOrder}
                disabled={loading}
                className="w-full bg-indigo-600 text-white py-3.5 rounded-2xl font-bold text-base hover:bg-indigo-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {loading ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : '🚀 Оформить заказ'}
              </motion.button>
              <div className="flex items-center gap-2 mt-4 text-xs text-gray-400">
                <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Безопасная оплата и возврат
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}