import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api'
import { toast } from '../store/toastStore'
import Dashboard from '../components/seller/Dashboard'
import ProductForm from '../components/seller/ProductForm'
import ProductTable from '../components/seller/ProductTable'
import SellerOrders from '../components/seller/SellerOrders'
import SellerFeedback from '../components/seller/SellerFeedback'
import StatusTabs from '../components/seller/StatusTabs'
import ConfirmModal from '../components/seller/ConfirmModal'
import ErrorState from '../components/states/ErrorState'

// Пустое состояние для каждой вкладки-фильтра (план 5.4): не общее «товаров
// нет», а конкретное «нет активных / на модерации / ...».
const EMPTY_BY_STATUS = {
  all: 'Товаров пока нет',
  active: 'Нет активных товаров',
  moderation: 'Нет товаров на модерации',
  hidden: 'Нет скрытых товаров',
  rejected: 'Нет отклонённых товаров',
  draft: 'Нет черновиков',
}

export default function SellerPage() {
  const [products, setProducts] = useState([])
  const [counts, setCounts] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [analytics, setAnalytics] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null) // null - создание, id - правка
  const [categories, setCategories] = useState([])
  const [activeTab, setActiveTab] = useState('dashboard')
  const [busyId, setBusyId] = useState(null)       // id товара под запросом видимости
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // Перезапрос списка при смене вкладки-фильтра (серверный фильтр, план 5.4).
  useEffect(() => {
    fetchProducts(statusFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter])

  useEffect(() => {
    fetchAnalytics()
    fetchCategories()
  }, [])

  async function fetchProducts(status = statusFilter) {
    setLoading(true)
    setListError(false)
    try {
      const params = status && status !== 'all' ? { status } : {}
      const res = await api.get('/products/my/', { params })
      setProducts(res.data.results)
      setCounts(res.data.counts)
    } catch {
      setListError(true)
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

  const openCreate = () => { setEditingId(null); setShowForm(true) }
  const openEdit = (id) => { setEditingId(id); setShowForm(true) }
  const closeForm = () => { setShowForm(false); setEditingId(null) }
  const handleFormDone = () => { closeForm(); fetchProducts() }

  // Скрыть/показать: только active<->hidden (бэкенд валидирует, план 5.2).
  const handleToggleVisibility = async (product) => {
    setBusyId(product.id)
    try {
      await api.post(`/products/my/${product.id}/visibility/`)
      toast.success(product.status === 'active' ? 'Товар скрыт с витрины' : 'Товар снова на витрине')
      await fetchProducts()
    } catch {
      toast.error('Не удалось изменить видимость')
    } finally {
      setBusyId(null)
    }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await api.delete(`/products/my/${deleteTarget.id}/`)
      toast.success('Товар удалён')
      setDeleteTarget(null)
      await fetchProducts()
    } catch {
      toast.error('Ошибка при удалении')
    } finally {
      setDeleting(false)
    }
  }

  // Только нейтральная вовлечённость (просмотры). Карточка «Продаж» (события
  // ClickHouse) убрана: честные продажи/деньги живут в табе «Дашборд» (Ф16,
  // решение 4.5) - иначе на экране были бы две разные «продажи».
  const totalViews = analytics.reduce((sum, a) => sum + (a.views || 0), 0)

  const TABS = [
    {
      id: 'dashboard',
      label: 'Дашборд',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      ),
    },
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
      id: 'orders',
      label: 'Заказы',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      ),
    },
    {
      id: 'feedback',
      label: 'Отзывы и вопросы',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
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
      // Всего товаров (всех статусов) - из counts, не из отфильтрованного списка.
      value: counts?.all ?? 0,
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
            <div className="flex items-center gap-2">
            <Link
              to="/seller/settings"
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/15 transition"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="hidden sm:inline">Настройки</span>
            </Link>
            <motion.button
              onClick={() => (showForm ? closeForm() : openCreate())}
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
          </div>
        </motion.div>

        {/* Статистика (вовлечённость): продажи/деньги - в табе «Дашборд» (4.5) */}
        <div className="grid grid-cols-2 gap-4 mb-6">
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

        {/* Форма товара (Ф12): создание/редактирование одним компонентом */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-6"
            >
              <ProductForm
                key={editingId || 'create'}
                productId={editingId}
                categories={categories}
                onDone={handleFormDone}
                onCancel={closeForm}
              />
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

          {/* Дашборд (Ф16): первый экран кабинета - сводка/график/действия */}
          {activeTab === 'dashboard' && <Dashboard key="dashboard" onNavigate={setActiveTab} />}

          {/* Товары */}
          {activeTab === 'products' && (
            <motion.div key="products" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <StatusTabs active={statusFilter} counts={counts} onChange={setStatusFilter} />

              {loading ? (
                <div className="flex flex-col gap-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="bg-white rounded-2xl h-16 skeleton" />
                  ))}
                </div>
              ) : listError ? (
                <ErrorState
                  title="Не удалось загрузить товары"
                  onRetry={() => fetchProducts()}
                />
              ) : products.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-2xl border border-gray-100">
                  <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
                    </svg>
                  </div>
                  <p className="text-gray-400">{EMPTY_BY_STATUS[statusFilter] || 'Товаров нет'}</p>
                  {statusFilter === 'all' && (
                    <button onClick={openCreate} className="mt-3 text-sm text-indigo-600 hover:underline font-medium">
                      Добавить первый товар
                    </button>
                  )}
                </div>
              ) : (
                <ProductTable
                  products={products}
                  onEdit={openEdit}
                  onToggleVisibility={handleToggleVisibility}
                  onDelete={setDeleteTarget}
                  busyId={busyId}
                />
              )}
            </motion.div>
          )}

          {/* Заказы (Ф14): рабочее место обработки заказов на товары продавца */}
          {activeTab === 'orders' && <SellerOrders key="orders" />}

          {/* Отзывы и вопросы (Ф15): агрегация UGC по своим товарам + ответы */}
          {activeTab === 'feedback' && <SellerFeedback key="feedback" />}

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

      {/* Подтверждение удаления (Ф13): модалка вместо confirm() */}
      <AnimatePresence>
        {deleteTarget && (
          <ConfirmModal
            title="Удалить товар?"
            message={`«${deleteTarget.name}» будет удалён без возможности восстановления.`}
            confirmLabel="Удалить"
            loading={deleting}
            onConfirm={confirmDelete}
            onCancel={() => !deleting && setDeleteTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}