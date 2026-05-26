import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api'

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

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products/my/')
      setProducts(res.data.results)
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const res = await api.get('/products/analytics/')
      setAnalytics(res.data)
    } catch {
      setAnalytics([])
    }
  }

  const fetchCategories = async () => {
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
      alert(err.response?.data?.detail || 'Ошибка при добавлении товара')
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Удалить товар?')) return
    try {
      await api.delete(`/products/my/${id}/`)
      fetchProducts()
    } catch {
      alert('Ошибка при удалении')
    }
  }

  const totalViews = analytics.reduce((sum, a) => sum + (a.views || 0), 0)
  const totalSales = analytics.reduce((sum, a) => sum + (a.purchases || 0), 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Заголовок */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-3xl p-6 mb-6 text-white relative overflow-hidden"
        >
          <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full" />
          <div className="absolute -right-5 -bottom-10 w-60 h-60 bg-white/5 rounded-full" />
          <div className="relative flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-black">Кабинет продавца</h1>
              <p className="text-white/70 text-sm mt-1">Управляйте товарами и отслеживайте продажи</p>
            </div>
            <motion.button
              onClick={() => setShowForm(!showForm)}
              className="bg-white text-emerald-600 px-5 py-2.5 rounded-2xl font-bold text-sm hover:bg-emerald-50 transition shadow-lg"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {showForm ? '✕ Отмена' : '+ Добавить товар'}
            </motion.button>
          </div>
        </motion.div>

        {/* Статистика */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          {[
            { label: 'Товаров', value: products.length, icon: '📦', color: 'from-blue-50 to-indigo-50 text-indigo-600' },
            { label: 'Просмотров', value: totalViews.toLocaleString(), icon: '👁️', color: 'from-purple-50 to-pink-50 text-purple-600' },
            { label: 'Продаж', value: totalSales.toLocaleString(), icon: '🛒', color: 'from-emerald-50 to-teal-50 text-emerald-600' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`bg-gradient-to-br ${stat.color} rounded-2xl p-4`}
            >
              <div className="text-2xl mb-1">{stat.icon}</div>
              <div className="text-2xl font-black">{stat.value}</div>
              <div className="text-sm font-medium opacity-70">{stat.label}</div>
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
              <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-5">Новый товар</h2>
                <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <input
                      name="name"
                      placeholder="Название товара *"
                      value={form.name}
                      onChange={handleChange}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
                      required
                    />
                  </div>
                  <input
                    name="slug"
                    placeholder="Slug (латиницей) *"
                    value={form.slug}
                    onChange={handleChange}
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
                    required
                  />
                  <select
                    name="category"
                    value={form.category}
                    onChange={handleChange}
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
                    required
                  >
                    <option value="">Категория *</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                  <input
                    name="price"
                    type="number"
                    placeholder="Цена ₽ *"
                    value={form.price}
                    onChange={handleChange}
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
                    required
                  />
                  <input
                    name="stock"
                    type="number"
                    placeholder="Количество *"
                    value={form.stock}
                    onChange={handleChange}
                    className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
                    required
                  />
                  <div className="col-span-2">
                    <textarea
                      name="description"
                      placeholder="Описание товара"
                      value={form.description}
                      onChange={handleChange}
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition resize-none"
                      rows={3}
                    />
                  </div>
                  <div className="col-span-2">
                    <motion.button
                      type="submit"
                      className="w-full bg-gradient-to-r from-emerald-500 to-teal-600 text-white py-3 rounded-2xl font-bold hover:from-emerald-600 hover:to-teal-700 transition shadow-lg shadow-emerald-200"
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
        <div className="flex gap-2 mb-6">
          {[
            { id: 'products', label: '📦 Мои товары' },
            { id: 'analytics', label: '📊 Аналитика' },
          ].map((tab) => (
            <motion.button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 rounded-2xl text-sm font-semibold transition-all ${
                activeTab === tab.id
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-100'
              }`}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {tab.label}
            </motion.button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {activeTab === 'products' && (
            <motion.div
              key="products"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[...Array(8)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl h-48 skeleton" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-3xl">
                  <p className="text-5xl mb-4">📦</p>
                  <p className="text-gray-400 text-lg">Товаров пока нет</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {products.map((product, i) => (
                    <motion.div
                      key={product.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 group"
                    >
                      <div className="h-36 bg-gray-50 flex items-center justify-center text-4xl">
                        📦
                      </div>
                      <div className="p-3">
                        <p className="font-semibold text-gray-800 text-sm line-clamp-2 mb-1">{product.name}</p>
                        <div className="flex items-center justify-between">
                          <span className="font-black text-gray-900 text-sm">{Number(product.price).toLocaleString()} ₽</span>
                          <span className="text-xs text-gray-400">{product.stock} шт.</span>
                        </div>
                        <motion.button
                          onClick={() => handleDelete(product.id)}
                          className="w-full mt-2 py-1.5 rounded-xl text-xs font-semibold text-red-400 hover:bg-red-50 hover:text-red-600 transition opacity-0 group-hover:opacity-100"
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

          {activeTab === 'analytics' && (
            <motion.div
              key="analytics"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden"
            >
              {analytics.length === 0 ? (
                <div className="text-center py-20">
                  <p className="text-5xl mb-4">📊</p>
                  <p className="text-gray-400">Данных пока нет</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-6 py-4 text-sm font-semibold text-gray-600">Товар</th>
                      <th className="text-right px-6 py-4 text-sm font-semibold text-gray-600">👁 Просмотры</th>
                      <th className="text-right px-6 py-4 text-sm font-semibold text-gray-600">🛒 Покупки</th>
                      <th className="text-right px-6 py-4 text-sm font-semibold text-gray-600">Конверсия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analytics.map((item, i) => (
                      <motion.tr
                        key={item.product_id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="border-b border-gray-50 hover:bg-gray-50 transition"
                      >
                        <td className="px-6 py-4 text-sm text-gray-800 font-medium">{item.name}</td>
                        <td className="px-6 py-4 text-sm text-right text-gray-600">{item.views || 0}</td>
                        <td className="px-6 py-4 text-sm text-right text-gray-600">{item.purchases || 0}</td>
                        <td className="px-6 py-4 text-sm text-right">
                          <span className="bg-emerald-50 text-emerald-600 px-2 py-1 rounded-lg text-xs font-semibold">
                            {item.views ? Math.round((item.purchases / item.views) * 100) : 0}%
                          </span>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}