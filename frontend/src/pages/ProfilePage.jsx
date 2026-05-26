import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import api from '../api'
import useAuthStore from '../store/authStore'
import ProductCard from '../components/ProductCard'

const STATUS_CONFIG = {
  created: { label: 'Создан', color: 'bg-gray-100 text-gray-600', icon: '🕐' },
  paid: { label: 'Оплачен', color: 'bg-blue-100 text-blue-600', icon: '💳' },
  processing: { label: 'В обработке', color: 'bg-amber-100 text-amber-600', icon: '⚙️' },
  shipped: { label: 'Отправлен', color: 'bg-purple-100 text-purple-600', icon: '🚚' },
  delivered: { label: 'Доставлен', color: 'bg-emerald-100 text-emerald-600', icon: '✅' },
  cancelled: { label: 'Отменён', color: 'bg-red-100 text-red-600', icon: '❌' },
}

const MENU_ITEMS = [
  { label: 'Главная', icon: '🏠', tab: 'main' },
  { label: 'Мои заказы', icon: '📦', tab: 'orders' },
  { label: 'Избранное', icon: '❤️', tab: null, link: '/wishlist' },
  { label: 'Профиль', icon: '👤', tab: 'profile' },
]

export default function ProfilePage() {
  const { user, fetchProfile } = useAuthStore()
  const [orders, setOrders] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('main')
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [ratings, setRatings] = useState({})

  const recentlyViewed = JSON.parse(localStorage.getItem('recently_viewed') || '[]')

  useEffect(() => {
    fetchProfile()
    fetchOrders()
    fetchRecommendations()
  }, [])

  const fetchOrders = async () => {
    try {
      const res = await api.get('/orders/')
      setOrders(res.data.results)
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  const fetchRecommendations = async () => {
    try {
      const res = await api.get('/products/recommendations/')
      setRecommendations(Array.isArray(res.data) ? res.data.slice(0, 8) : [])
    } catch {
      setRecommendations([])
    }
  }

  const handleRating = (itemId, star) => {
    setRatings(prev => ({ ...prev, [itemId]: star }))
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex gap-6 items-start">

          {/* Боковая панель */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-64 shrink-0 sticky top-24"
          >
            {/* Аватарка */}
            <div className="bg-white rounded-2xl p-6 border border-gray-100 mb-3">
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-3xl font-black text-white mb-3 shadow-lg shadow-indigo-200">
                  {user?.username?.[0]?.toUpperCase() || 'U'}
                </div>
                <h2 className="font-bold text-gray-800 text-base">{user?.username}</h2>
                <p className="text-gray-400 text-xs mt-0.5 truncate w-full text-center">{user?.email}</p>
                <button
                  onClick={() => setActiveTab('profile')}
                  className="mt-3 text-xs text-indigo-600 hover:underline font-medium"
                >
                  Изменить профиль
                </button>
              </div>
            </div>

            {/* Меню */}
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {MENU_ITEMS.map((item, i) => (
                item.link ? (
                  <Link
                    key={i}
                    to={item.link}
                    className="flex items-center gap-3 px-5 py-3.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-[#111] transition border-b border-gray-50 last:border-0"
                  >
                    <span>{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                  </Link>
                ) : (
                  <button
                    key={i}
                    onClick={() => setActiveTab(item.tab)}
                    className={`w-full flex items-center gap-3 px-5 py-3.5 text-sm transition border-b border-gray-50 last:border-0 ${
                      activeTab === item.tab
                        ? 'bg-indigo-50 text-indigo-600 font-semibold'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-[#111]'
                    }`}
                  >
                    <span>{item.icon}</span>
                    <span className="font-medium">{item.label}</span>
                    {item.tab === 'orders' && orders.length > 0 && (
                      <span className="ml-auto bg-indigo-100 text-indigo-600 text-xs font-bold px-2 py-0.5 rounded-full">
                        {orders.length}
                      </span>
                    )}
                  </button>
                )
              ))}
            </div>
          </motion.div>

          {/* Основной контент */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">

              {/* Главная */}
              {activeTab === 'main' && (
                <motion.div
                  key="main"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col gap-5"
                >

                  {/* Оцените покупки */}
                  {orders.length > 0 && (
                    <div className="bg-white rounded-2xl p-6 border border-gray-100">
                      <h2 className="text-lg font-bold text-gray-800 mb-4">Оцените покупки</h2>
                      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                        {orders.slice(0, 6).flatMap(order =>
                          order.items.map(item => (
                            <div
                              key={item.id}
                              className="shrink-0 w-44 flex flex-col items-center text-center gap-2 p-4 border border-gray-100 rounded-2xl hover:border-gray-200 hover:shadow-sm transition"
                            >
                              <div className="w-20 h-20 bg-gray-100 rounded-xl flex items-center justify-center text-3xl">📦</div>
                              <p className="text-xs text-gray-600 line-clamp-2 font-medium leading-tight">{item.product_name}</p>
                              <div className="flex gap-0.5">
                                {[1,2,3,4,5].map(star => (
                                  <button
                                    key={star}
                                    onClick={() => handleRating(item.id, star)}
                                    className={`text-xl leading-none transition ${
                                      (ratings[item.id] || 0) >= star ? 'text-amber-400' : 'text-gray-200 hover:text-amber-300'
                                    }`}
                                  >
                                    ★
                                  </button>
                                ))}
                              </div>
                              {ratings[item.id] && (
                                <span className="text-xs text-emerald-500 font-medium">Спасибо!</span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* Вы смотрели */}
                  {recentlyViewed.length > 0 && (
                    <div className="bg-white rounded-2xl p-6 border border-gray-100">
                      <h2 className="text-lg font-bold text-gray-800 mb-4">Вы смотрели</h2>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {recentlyViewed.slice(0, 8).map((product, i) => (
                          <motion.div
                            key={product.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                          >
                            <ProductCard product={product} />
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Рекомендации */}
                  {recommendations.length > 0 && (
                    <div className="bg-white rounded-2xl p-6 border border-gray-100">
                      <h2 className="text-lg font-bold text-gray-800 mb-4">Подобрали для вас</h2>
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {recommendations.map((product, i) => (
                          <motion.div
                            key={product.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.04 }}
                          >
                            <ProductCard product={product} />
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Последние заказы */}
                  <div className="bg-white rounded-2xl p-6 border border-gray-100">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold text-gray-800">Последние заказы</h2>
                      <button
                        onClick={() => setActiveTab('orders')}
                        className="text-sm text-indigo-600 hover:underline font-medium"
                      >
                        Все заказы →
                      </button>
                    </div>
                    {orders.length === 0 ? (
                      <p className="text-gray-400 text-sm text-center py-6">Заказов пока нет</p>
                    ) : (
                      orders.slice(0, 3).map(order => {
                        const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.created
                        return (
                          <div key={order.id} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                            <div className="flex items-center gap-3">
                              <span className="text-xl">{status.icon}</span>
                              <div>
                                <p className="font-semibold text-sm text-gray-800">Заказ #{order.id}</p>
                                <p className="text-xs text-gray-400">
                                  {new Date(order.created_at).toLocaleDateString('ru-RU')}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${status.color}`}>
                                {status.label}
                              </span>
                              <span className="font-black text-sm text-gray-900">
                                {Number(order.total_price).toLocaleString()} ₽
                              </span>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>

                </motion.div>
              )}

              {/* Заказы */}
              {activeTab === 'orders' && (
                <motion.div
                  key="orders"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <h2 className="text-xl font-black text-gray-800 mb-4">Мои заказы</h2>
                  {loading ? (
                    <div className="flex flex-col gap-3">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="bg-white rounded-2xl h-20 skeleton" />
                      ))}
                    </div>
                  ) : orders.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl">
                      <p className="text-5xl mb-4">📭</p>
                      <p className="text-gray-400">Заказов пока нет</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {orders.map((order, i) => {
                        const status = STATUS_CONFIG[order.status] || STATUS_CONFIG.created
                        const isExpanded = expandedOrder === order.id
                        return (
                          <motion.div
                            key={order.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className="bg-white rounded-2xl overflow-hidden border border-gray-100"
                          >
                            <button
                              onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                              className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition"
                            >
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-lg">
                                  {status.icon}
                                </div>
                                <div className="text-left">
                                  <p className="font-bold text-gray-800">Заказ #{order.id}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">
                                    {new Date(order.created_at).toLocaleDateString('ru-RU', {
                                      day: 'numeric', month: 'long', year: 'numeric'
                                    })}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${status.color}`}>
                                  {status.label}
                                </span>
                                <span className="font-black text-gray-900">
                                  {Number(order.total_price).toLocaleString()} ₽
                                </span>
                                <svg
                                  className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </button>
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="border-t border-gray-100 overflow-hidden"
                                >
                                  <div className="p-5 flex flex-col gap-2">
                                    <p className="text-sm text-gray-500 mb-2">📍 {order.delivery_address}</p>
                                    {order.items.map(item => (
                                      <div key={item.id} className="flex justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                                        <span className="text-gray-700">{item.product_name}</span>
                                        <span className="text-gray-500 shrink-0 ml-4">
                                          {item.quantity} шт. × {Number(item.price_at_purchase).toLocaleString()} ₽
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        )
                      })}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Профиль */}
              {activeTab === 'profile' && (
                <motion.div
                  key="profile"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <h2 className="text-xl font-black text-gray-800 mb-4">Личные данные</h2>
                  <div className="bg-white rounded-2xl p-6 border border-gray-100 flex flex-col gap-4">
                    {[
                      { label: 'Email', value: user?.email, icon: '📧' },
                      { label: 'Имя пользователя', value: user?.username, icon: '👤' },
                      { label: 'Роль', value: user?.role === 'buyer' ? 'Покупатель' : user?.role === 'seller' ? 'Продавец' : 'Администратор', icon: '🎭' },
                    ].map(field => (
                      <div key={field.label} className="flex items-center gap-4 p-4 bg-gray-50 rounded-2xl">
                        <span className="text-xl">{field.icon}</span>
                        <div>
                          <p className="text-xs text-gray-400 font-medium">{field.label}</p>
                          <p className="text-gray-800 font-semibold">{field.value}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  )
}