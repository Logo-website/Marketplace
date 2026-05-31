import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import api from '../api'
import useAuthStore from '../store/authStore'
import ProductCard from '../components/ProductCard'

const STATUS_CONFIG = {
  created:    { label: 'Создан',       color: 'bg-gray-100 text-gray-600',       icon: '🕐' },
  paid:       { label: 'Оплачен',      color: 'bg-blue-100 text-blue-600',       icon: '💳' },
  processing: { label: 'В обработке',  color: 'bg-amber-100 text-amber-600',     icon: '⚙️' },
  shipped:    { label: 'Отправлен',    color: 'bg-purple-100 text-purple-600',   icon: '🚚' },
  delivered:  { label: 'Доставлен',    color: 'bg-emerald-100 text-emerald-600', icon: '✅' },
  cancelled:  { label: 'Отменён',      color: 'bg-red-100 text-red-600',         icon: '❌' },
}

const NAV_ITEMS = [
  { id: 'main',     label: 'Обзор',     icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg> },
  { id: 'orders',   label: 'Заказы',    icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg> },
  { id: 'wishlist', label: 'Избранное', link: '/wishlist', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg> },
  { id: 'profile',  label: 'Настройки', icon: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
]

function ProfileField({ label, fieldKey, value, type, icon, description }) {
  const { fetchProfile } = useAuthStore()
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await api.patch('/auth/profile/', { [fieldKey]: inputValue })
      await fetchProfile()
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.response?.data?.[fieldKey]?.[0] || 'Ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditing(false)
    setInputValue(value || '')
    setError('')
  }

  return (
    <motion.div
      layout
      className="relative"
    >
      <div className={`p-5 rounded-2xl border transition-all duration-200 ${
        editing
          ? 'border-indigo-200 bg-indigo-50/30 shadow-sm'
          : 'border-gray-100 bg-white hover:border-gray-200'
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            {/* Иконка */}
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              editing ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'
            }`}>
              {icon}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
                {saved && (
                  <motion.span
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="text-xs text-emerald-500 font-semibold flex items-center gap-1"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Сохранено
                  </motion.span>
                )}
              </div>

              <AnimatePresence mode="wait">
                {editing ? (
                  <motion.div
                    key="editing"
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="flex flex-col gap-2 mt-1"
                  >
                    <input
                      type={type}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSave()
                        if (e.key === 'Escape') handleCancel()
                      }}
                      className="w-full border border-indigo-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white font-medium"
                      autoFocus
                      placeholder={`Введите ${label.toLowerCase()}...`}
                    />
                    {error && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        {error}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <motion.button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-1.5 text-xs bg-[#111] text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition disabled:opacity-50 font-semibold"
                        whileTap={{ scale: 0.97 }}
                      >
                        {saving ? (
                          <>
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                            Сохранение...
                          </>
                        ) : 'Сохранить'}
                      </motion.button>
                      <button
                        onClick={handleCancel}
                        className="text-xs text-gray-400 hover:text-gray-600 px-3 py-2 rounded-xl hover:bg-gray-100 transition font-medium"
                      >
                        Отмена
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="display"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">
                      {value || <span className="text-gray-300 font-normal">Не указано</span>}
                    </p>
                    {description && !editing && (
                      <p className="text-xs text-gray-400 mt-0.5">{description}</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {!editing && (
            <motion.button
              onClick={() => setEditing(true)}
              className="shrink-0 flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#111] px-3 py-1.5 rounded-xl hover:bg-gray-100 transition font-medium mt-1"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Изменить
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

export default function ProfilePage() {
  const { user, fetchProfile } = useAuthStore()
  const [orders, setOrders] = useState([])
  const [recommendations, setRecommendations] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('main')
  const [expandedOrder, setExpandedOrder] = useState(null)
  const [ratings, setRatings] = useState({})
  const [hiddenItems, setHiddenItems] = useState(new Set())
  const [orderProducts, setOrderProducts] = useState({})

  const recentlyViewed = JSON.parse(localStorage.getItem('recently_viewed') || '[]')

  useEffect(() => {
    fetchProfile()
    fetchOrders()
    fetchRecommendations()
  }, [])

  const fetchOrders = async () => {
    try {
      const res = await api.get('/orders/')
      const orderData = res.data.results ?? res.data
      setOrders(orderData)
      const items = orderData.slice(0, 6).flatMap(o => o.items ?? [])
      const ids = [...new Set(items.map(i => i.product).filter(Boolean))]
      const products = await Promise.all(
        ids.map(id => api.get(`/products/${id}/`).then(r => r.data).catch(() => null))
      )
      const map = {}
      products.filter(Boolean).forEach(p => { map[p.id] = p })
      setOrderProducts(map)
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
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

  const handleRating = (itemId, star) => {
    setRatings(prev => ({ ...prev, [itemId]: star }))
  }

  const rateableItems = orders.slice(0, 6).flatMap(o => o.items ?? [])

  const PROFILE_FIELDS = [
    {
      fieldKey: 'email',
      label: 'Email',
      value: user?.email,
      type: 'email',
      description: 'Используется для входа и уведомлений',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
    },
    {
      fieldKey: 'username',
      label: 'Имя пользователя',
      value: user?.username,
      type: 'text',
      description: 'Отображается на сайте',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
    },
    {
      fieldKey: 'phone',
      label: 'Телефон',
      value: user?.phone || '',
      type: 'tel',
      description: 'Для связи по заказам',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>,
    },
  ]

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex gap-6 items-start">

          {/* Сайдбар */}
          <motion.aside
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="w-60 shrink-0 sticky top-24 flex flex-col gap-3"
          >
            <div className="bg-[#111] rounded-2xl p-5 relative overflow-hidden">
              <div className="absolute inset-0 opacity-10" style={{ background: 'radial-gradient(circle at 80% 20%, #6366f1 0%, transparent 60%)' }} />
              <div className="relative flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xl font-black text-white shrink-0">
                  {user?.username?.[0]?.toUpperCase() ?? 'U'}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-white text-sm truncate">{user?.username ?? '—'}</p>
                  <p className="text-gray-400 text-xs truncate">{user?.email ?? ''}</p>
                </div>
              </div>
              <div className="relative mt-4 pt-4 border-t border-white/10 flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {user?.role === 'buyer' ? 'Покупатель' : user?.role === 'seller' ? 'Продавец' : 'Администратор'}
                </span>
                <button onClick={() => setActiveTab('profile')} className="text-xs text-indigo-400 hover:text-indigo-300 transition font-medium">
                  Изменить →
                </button>
              </div>
            </div>

            <nav className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              {NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.id
                if (item.link) {
                  return (
                    <Link key={item.id} to={item.link} className="flex items-center gap-3 px-4 py-3.5 text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition border-b border-gray-50 last:border-0">
                      <span className="opacity-70">{item.icon}</span>
                      <span className="text-sm font-medium">{item.label}</span>
                    </Link>
                  )
                }
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 transition border-b border-gray-50 last:border-0 text-left ${isActive ? 'bg-[#111] text-white' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'}`}
                  >
                    <span className={isActive ? 'opacity-100' : 'opacity-70'}>{item.icon}</span>
                    <span className="text-sm font-medium">{item.label}</span>
                    {item.id === 'orders' && orders.length > 0 && (
                      <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${isActive ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-500'}`}>
                        {orders.length}
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>

            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Статистика</p>
              <div className="flex flex-col gap-2">
                {[
                  { label: 'Заказов', value: orders.length },
                  { label: 'Просмотрено', value: recentlyViewed.length },
                ].map(stat => (
                  <div key={stat.label} className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">{stat.label}</span>
                    <span className="text-sm font-black text-gray-900">{stat.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.aside>

          {/* Основной контент */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">

              {activeTab === 'main' && (
                <motion.div key="main" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex flex-col gap-6">

                  {rateableItems.length > 0 && (
                    <section className="bg-white rounded-2xl p-6 border border-gray-100">
                      <div className="flex items-center justify-between mb-5">
                        <h2 className="text-base font-bold text-gray-900">Оцените покупки</h2>
                        <span className="text-xs text-gray-400">{rateableItems.filter(i => !hiddenItems.has(i.id)).length} товаров</span>
                      </div>
                      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-1">
                        {rateableItems.filter(item => !hiddenItems.has(item.id)).map(item => (
                          <div key={item.id} className="shrink-0 w-44 flex flex-col items-center text-center gap-2 p-4 border border-gray-100 rounded-2xl hover:border-gray-200 hover:shadow-md transition relative group">
                            <button onClick={() => setHiddenItems(prev => new Set([...prev, item.id]))} className="absolute top-2 right-2 text-gray-200 group-hover:text-gray-400 text-xs transition">✕</button>
                            <div className="w-20 h-20 bg-gray-50 rounded-xl overflow-hidden flex items-center justify-center">
                              {orderProducts[item.product]?.images?.[0]?.image_url ? (
                                <img src={orderProducts[item.product].images[0].image_url} alt={item.product_name} className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none' }} />
                              ) : <span className="text-3xl">📦</span>}
                            </div>
                            <p className="text-xs text-gray-700 line-clamp-2 font-medium leading-tight">{item.product_name}</p>
                            <div className="flex gap-0.5">
                              {[1,2,3,4,5].map(star => (
                                <button key={star} onClick={() => { handleRating(item.id, star); setTimeout(() => setHiddenItems(prev => new Set([...prev, item.id])), 800) }} className={`text-xl leading-none transition ${(ratings[item.id] ?? 0) >= star ? 'text-amber-400' : 'text-gray-200 hover:text-amber-300'}`}>★</button>
                              ))}
                            </div>
                            {ratings[item.id] && <span className="text-[11px] text-emerald-500 font-semibold">Спасибо!</span>}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {recentlyViewed.length > 0 && (
                    <section className="bg-white rounded-2xl p-6 border border-gray-100">
                      <div className="flex items-center justify-between mb-5">
                        <h2 className="text-base font-bold text-gray-900">Вы смотрели</h2>
                        <span className="text-xs text-gray-400">{recentlyViewed.length} товаров</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {recentlyViewed.slice(0, 8).map((product, i) => (
                          <motion.div key={product.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                            <ProductCard product={product} />
                          </motion.div>
                        ))}
                      </div>
                    </section>
                  )}

                  {recommendations.length > 0 && (
                    <section className="bg-white rounded-2xl p-6 border border-gray-100">
                      <h2 className="text-base font-bold text-gray-900 mb-5">Подобрали для вас</h2>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                        {recommendations.map((product, i) => (
                          <motion.div key={product.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                            <ProductCard product={product} />
                          </motion.div>
                        ))}
                      </div>
                    </section>
                  )}
                </motion.div>
              )}

              {activeTab === 'orders' && (
                <motion.div key="orders" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-xl font-black text-gray-900">Мои заказы</h2>
                    <span className="text-sm text-gray-400">{orders.length} заказов</span>
                  </div>
                  {loading ? (
                    <div className="flex flex-col gap-3">{[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-20 animate-pulse" />)}</div>
                  ) : orders.length === 0 ? (
                    <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                      <p className="text-5xl mb-4">📭</p>
                      <p className="text-gray-400">Заказов пока нет</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      {orders.map((order, i) => {
                        const status = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.created
                        const isExpanded = expandedOrder === order.id
                        return (
                          <motion.div key={order.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }} className="bg-white rounded-2xl overflow-hidden border border-gray-100">
                            <button onClick={() => setExpandedOrder(isExpanded ? null : order.id)} className="w-full p-5 flex items-center justify-between hover:bg-gray-50 transition">
                              <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-gray-50 rounded-xl flex items-center justify-center text-lg border border-gray-100">{status.icon}</div>
                                <div className="text-left">
                                  <p className="font-bold text-gray-800">Заказ #{order.id}</p>
                                  <p className="text-xs text-gray-400 mt-0.5">{new Date(order.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`px-3 py-1.5 rounded-xl text-xs font-semibold ${status.color}`}>{status.label}</span>
                                <span className="font-black text-gray-900">{Number(order.total_price).toLocaleString()} ₽</span>
                                <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </button>
                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-gray-100 overflow-hidden">
                                  <div className="p-5 flex flex-col gap-2">
                                    {order.delivery_address && <p className="text-sm text-gray-500 mb-2">📍 {order.delivery_address}</p>}
                                    {(order.items ?? []).map(item => (
                                      <div key={item.id} className="flex justify-between text-sm py-2 border-b border-gray-50 last:border-0">
                                        <span className="text-gray-700">{item.product_name}</span>
                                        <span className="text-gray-500 shrink-0 ml-4">{item.quantity} шт. × {Number(item.price_at_purchase).toLocaleString()} ₽</span>
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

              {activeTab === 'profile' && (
                <motion.div key="profile" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>

                  {/* Заголовок */}
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="text-xl font-black text-gray-900">Настройки профиля</h2>
                      <p className="text-sm text-gray-400 mt-0.5">Управляйте своими личными данными</p>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-xl font-black text-white shadow-lg shadow-indigo-200">
                      {user?.username?.[0]?.toUpperCase() ?? 'U'}
                    </div>
                  </div>

                  {/* Поля */}
                  <div className="flex flex-col gap-3 mb-6">
                    {PROFILE_FIELDS.map(field => (
                      <ProfileField key={field.fieldKey} {...field} />
                    ))}
                  </div>

                  {/* Роль — отдельная карточка */}
                  <div className="p-5 rounded-2xl border border-gray-100 bg-white">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Роль</p>
                        <p className="text-sm font-semibold text-gray-900 mt-0.5">
                          {user?.role === 'buyer' ? 'Покупатель' : user?.role === 'seller' ? 'Продавец' : 'Администратор'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">Роль нельзя изменить самостоятельно</p>
                      </div>
                      <span className={`text-xs font-semibold px-3 py-1.5 rounded-xl ${
                        user?.role === 'buyer' ? 'bg-blue-50 text-blue-600' :
                        user?.role === 'seller' ? 'bg-emerald-50 text-emerald-600' :
                        'bg-purple-50 text-purple-600'
                      }`}>
                        {user?.role === 'buyer' ? '🛍️' : user?.role === 'seller' ? '🏪' : '⚡'} {user?.role}
                      </span>
                    </div>
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