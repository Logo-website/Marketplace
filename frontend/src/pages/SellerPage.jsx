import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api'
import { toast } from '../store/toastStore'

export default function SellerPage() {
  const [products, setProducts] = useState([])
  const [analytics, setAnalytics] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [categories, setCategories] = useState([])
  const [activeTab, setActiveTab] = useState('products')
  const [form, setForm] = useState({
    name: '', slug: '', description: '', price: '', stock: '', category: ''
  })

  useEffect(() => {
    fetchProducts()
    fetchAnalytics()
    fetchCategories()
  }, [])

  async function fetchProducts() {
    try {
      const res = await api.get('/products/my/')
      setProducts(res.data.results)
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  async function fetchAnalytics() {
    try {
      const res = await api.get('/products/analytics/')
      setAnalytics(res.data)
    } catch {
      setAnalytics([])
    }
  }

  async function fetchCategories() {
    try {
      const res = await api.get('/products/categories/')
      setCategories(res.data.results || res.data)
    } catch {
      setCategories([])
    }
  }

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      await api.post('/products/create/', form)
      setShowForm(false)
      setForm({ name: '', slug: '', description: '', price: '', stock: '', category: '' })
      fetchProducts()
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Ошибка при добавлении товара')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Удалить товар?')) return
    try {
      await api.delete(`/products/my/${id}/`)
      fetchProducts()
    } catch {
      toast.error('Ошибка при удалении')
    }
  }

  const totalViews = analytics.reduce((sum, a) => sum + (a.views || 0), 0)
  const totalSales = analytics.reduce((sum, a) => sum + (a.purchases || 0), 0)

  const TABS = [
    {
      id: 'products',
      label: 'Товары',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
        </svg>
      ),
    },
    {
      id: 'analytics',
      label: 'Аналитика',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
  ]

  const STATS = [
    {
      label: 'Товаров',
      value: products.length,
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
        </svg>
      ),
    },
    {
      label: 'Просмотров',
      value: totalViews.toLocaleString(),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      ),
    },
    {
      label: 'Продаж',
      value: totalSales.toLocaleString(),
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
      ),
    },
  ]

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Шапка */}
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#111] rounded-2xl p-6 mb-6 relative overflow-hidden"
        >
          <div className="absolute inset-0 opacity-10"
            style={{ background: 'radial-gradient(circle at 90% 50%, #6366f1 0%, transparent 60%)' }}
          />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-1">Кабинет</p>
              <h1 className="text-2xl font-black text-white">Управление магазином</h1>
              <p className="text-gray-400 text-sm mt-1">Товары, аналитика и продажи</p>
            </div>
            <motion.button
              onClick={() => setShowForm(!showForm)}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                showForm
                  ? 'bg-white/10 text-white hover:bg-white/15'
                  : 'bg-white text-[#111] hover:bg-gray-100'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {showForm ? (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Отмена
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Добавить товар
                </>
              )}
            </motion.button>
          </div>
        </motion.div>

        {/* Статистика */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="bg-white rounded-2xl p-5 border border-gray-100"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center text-gray-500">
                  {stat.icon}
                </div>
              </div>
              <p className="text-2xl font-black text-gray-900">{stat.value}</p>
              <p className="text-sm text-gray-400 mt-0.5">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Форма добавления */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-6"
            >
              <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h2 className="text-base font-bold text-gray-900 mb-5">Новый товар</h2>
                <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">

                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Название *</label>
                    <input
                      name="name" placeholder="Название товара" value={form.name} onChange={handleChange}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50 focus:bg-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Slug *</label>
                    <input
                      name="slug" placeholder="product-slug" value={form.slug} onChange={handleChange}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50 focus:bg-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Категория *</label>
                    <select
                      name="category" value={form.category} onChange={handleChange}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50 focus:bg-white appearance-none"
                      required
                    >
                      <option value="">Выберите категорию</option>
                      {categories.map((cat) => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Цена ₽ *</label>
                    <input
                      name="price" type="number" placeholder="0" value={form.price} onChange={handleChange}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50 focus:bg-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Остаток *</label>
                    <input
                      name="stock" type="number" placeholder="0" value={form.stock} onChange={handleChange}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50 focus:bg-white"
                      required
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Описание</label>
                    <textarea
                      name="description" placeholder="Описание товара" value={form.description} onChange={handleChange}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50 focus:bg-white resize-none"
                      rows={3}
                    />
                  </div>

                  <div className="col-span-2">
                    <motion.button
                      type="submit"
                      className="w-full bg-[#111] text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition"
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Добавить товар
                    </motion.button>
                  </div>
                </form>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Табы */}
        <div className="flex items-center bg-white border border-gray-100 rounded-2xl p-1 gap-1 mb-6 w-fit">
          {TABS.map(tab => (
            <motion.button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-[#111] text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {tab.icon}
              {tab.label}
            </motion.button>
          ))}
        </div>

        {/* Контент */}
        <AnimatePresence mode="wait">

          {/* Товары */}
          {activeTab === 'products' && (
            <motion.div key="products" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl h-48 skeleton" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
                    </svg>
                  </div>
                  <p className="text-gray-400">Товаров пока нет</p>
                  <button onClick={() => setShowForm(true)} className="mt-3 text-sm text-indigo-600 hover:underline font-medium">
                    Добавить первый товар
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {products.map((product, i) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:border-gray-200 hover:shadow-md transition-all group"
                    >
                      <div className="h-36 bg-gray-50 flex items-center justify-center">
                        <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
                        </svg>
                      </div>
                      <div className="p-4">
                        <p className="font-semibold text-gray-800 text-sm line-clamp-2 mb-2 leading-snug">{product.name}</p>
                        <div className="flex items-center justify-between mb-3">
                          <span className="font-black text-gray-900 text-sm">{Number(product.price).toLocaleString()} ₽</span>
                          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-lg">{product.stock} шт.</span>
                        </div>
                        <motion.button
                          onClick={() => handleDelete(product.id)}
                          className="w-full py-1.5 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-50 hover:text-red-600 transition opacity-0 group-hover:opacity-100 border border-transparent hover:border-red-100"
                          whileTap={{ scale: 0.95 }}
                        >
                          Удалить
                        </motion.button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* Аналитика */}
          {activeTab === 'analytics' && (
            <motion.div key="analytics" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {analytics.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <p className="text-gray-400">Данных пока нет</p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Товар</th>
                        <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Просмотры</th>
                        <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Покупки</th>
                        <th className="text-right px-6 py-4 text-xs font-semibold text-gray-400 uppercase tracking-wide">Конверсия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analytics.map((item, i) => {
                        const conv = item.views ? Math.round((item.purchases / item.views) * 100) : 0
                        return (
                          <motion.tr
                            key={item.product_id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className="border-b border-gray-50 last:border-0 hover:bg-gray-50 transition"
                          >
                            <td className="px-6 py-4 text-sm text-gray-800 font-medium">{item.name}</td>
                            <td className="px-6 py-4 text-sm text-right text-gray-500">{item.views || 0}</td>
                            <td className="px-6 py-4 text-sm text-right text-gray-500">{item.purchases || 0}</td>
                            <td className="px-6 py-4 text-right">
                              <span className={`inline-block text-xs font-semibold px-2.5 py-1 rounded-lg ${
                                conv >= 10 ? 'bg-emerald-50 text-emerald-600' :
                                conv >= 5  ? 'bg-amber-50 text-amber-600' :
                                             'bg-gray-100 text-gray-500'
                              }`}>
                                {conv}%
                              </span>
                            </td>
                          </motion.tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}