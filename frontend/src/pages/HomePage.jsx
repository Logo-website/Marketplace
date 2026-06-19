import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api'
import ProductCard from '../components/ProductCard'
import useAsyncData from '../hooks/useAsyncData'
import { ProductGridSkeleton } from '../components/states/Skeleton'
import EmptyState from '../components/states/EmptyState'
import ErrorState from '../components/states/ErrorState'

const SORT_OPTIONS = [
  { id: 'popular',    label: 'Популярные',   icon: '🔥' },
  { id: 'new',        label: 'Новинки',      icon: '✨' },
  { id: 'rating',     label: 'По рейтингу',  icon: '⭐' },
  { id: 'price_asc',  label: 'Дешевле',      icon: '↓' },
  { id: 'price_desc', label: 'Дороже',       icon: '↑' },
]

export default function HomePage() {
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('popular')

  // Загрузка товаров через единый хук: skeleton/empty/error без путаницы.
  const { data, status, retry } = useAsyncData(
    (signal) => {
      let url = `/products/?page=${page}&sort=${sort}`
      if (selectedCategory) url += `&category=${selectedCategory}`
      return api.get(url, { signal }).then((r) => r.data)
    },
    [selectedCategory, page, sort]
  )
  const products = data?.results ?? []
  const totalCount = data?.count ?? 0

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    try {
      const res = await api.get('/products/categories/')
      setCategories(res.data.results || res.data)
    } catch {
      setCategories([])
    }
  }

  const handleCategoryChange = (id) => {
    setSelectedCategory(id)
    setPage(1)
    window.scrollTo(0, 0)
  }

  const handleSort = (id) => {
    setSort(id)
    setPage(1)
    window.scrollTo(0, 0)
  }

  const totalPages = Math.ceil(totalCount / 20)

  const getPaginationPages = () => {
    const pages = []
    const delta = 2
    const left = page - delta
    const right = page + delta + 1
    let last = null

    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || (i >= left && i < right)) {
        if (last && i - last > 1) pages.push('...')
        pages.push(i)
        last = i
      }
    }
    return pages
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5]">

      {/* Hero */}
      <div className="bg-[#111] px-4 pb-6 pt-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">

          <div className="md:col-span-2 bg-gradient-to-br from-[#1a1a2e] to-[#0f3460] rounded-2xl p-8 relative overflow-hidden">
            <div className="relative z-10">
              <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">Маркетплейс одежды</span>
              <h1 className="text-3xl font-black text-white mt-2 mb-2">Одежда для любого стиля</h1>
              <p className="text-gray-400 mb-5">
                {totalCount > 0 ? `${totalCount.toLocaleString()} товаров` : '728 товаров'} от лучших брендов
              </p>
              <motion.button
                onClick={() => handleCategoryChange(null)}
                className="px-5 py-2.5 bg-white text-[#111] rounded-xl font-bold text-sm hover:bg-gray-100 transition"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                Смотреть всё →
              </motion.button>
            </div>
            <div className="absolute -right-8 -bottom-8 text-9xl opacity-10">👕</div>
            <div className="absolute right-20 top-4 text-6xl opacity-5">👗</div>
          </div>

          <div className="flex flex-col gap-4">
            <motion.div
              onClick={() => { const cat = categories.find(c => c.name === 'Джинсы'); if (cat) handleCategoryChange(cat.id) }}
              className="flex-1 bg-gradient-to-br from-[#2d1b69] to-[#1a1a2e] rounded-2xl p-5 relative overflow-hidden cursor-pointer hover:opacity-90 transition"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">Популярное</span>
              <p className="text-white font-bold text-lg mt-1">Джинсы</p>
              <div className="absolute right-3 bottom-3 text-5xl opacity-20">👖</div>
            </motion.div>
            <motion.div
              onClick={() => { const cat = categories.find(c => c.name === 'Спортивная одежда'); if (cat) handleCategoryChange(cat.id) }}
              className="flex-1 bg-gradient-to-br from-[#0f3460] to-[#1a1a2e] rounded-2xl p-5 relative overflow-hidden cursor-pointer hover:opacity-90 transition"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="text-xs font-bold text-cyan-400 uppercase tracking-widest">Хит сезона</span>
              <p className="text-white font-bold text-lg mt-1">Спортивная одежда</p>
              <div className="absolute right-3 bottom-3 text-5xl opacity-20">🏃</div>
            </motion.div>
          </div>

        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Категории */}
        <div className="bg-white rounded-2xl p-4 mb-4 border border-gray-100">
          <div className="flex flex-wrap gap-2">
            <motion.button
              onClick={() => handleCategoryChange(null)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                !selectedCategory ? 'bg-[#111] text-white border-[#111]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Все товары
            </motion.button>
            {categories.map((cat, i) => (
              <motion.button
                key={cat.id}
                onClick={() => handleCategoryChange(cat.id)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                  selectedCategory === cat.id ? 'bg-[#111] text-white border-[#111]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.02 }}
              >
                {cat.name}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Заголовок + сортировка */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-black text-[#111]">
              {selectedCategory ? categories.find(c => c.id === selectedCategory)?.name : 'Все товары'}
            </h2>
            {status === 'ready' && (
              <p className="text-sm text-gray-400 mt-0.5">{totalCount.toLocaleString()} товаров</p>
            )}
          </div>

          {/* Сортировка */}
          <div className="flex items-center bg-white border border-gray-100 rounded-2xl p-1 gap-1">
            {SORT_OPTIONS.map(option => (
              <motion.button
                key={option.id}
                onClick={() => handleSort(option.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  sort === option.id
                    ? 'bg-[#111] text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
                }`}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                <span>{option.icon}</span>
                <span className="hidden sm:block">{option.label}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Товары */}
        <AnimatePresence mode="wait">
          {status === 'loading' ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <ProductGridSkeleton count={10} />
            </motion.div>
          ) : status === 'error' ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <ErrorState onRetry={retry} />
            </motion.div>
          ) : products.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <EmptyState
                icon="🔍"
                title="Товаров не найдено"
                subtitle="Попробуйте другую категорию или сортировку"
              />
            </motion.div>
          ) : (
            <motion.div
              key={`${sort}-${selectedCategory}-${page}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
            >
              {products.map((product, i) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                >
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Пагинация */}
        {totalCount > 20 && (
          <div className="flex justify-center items-center gap-1.5 mt-10">
            <motion.button
              onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo(0, 0) }}
              disabled={page === 1}
              className="px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              ←
            </motion.button>

            <div className="flex gap-1">
              {getPaginationPages().map((p, i) =>
                p === '...' ? (
                  <span key={`dots-${i}`} className="w-10 h-10 flex items-center justify-center text-gray-400 text-sm">
                    ...
                  </span>
                ) : (
                  <motion.button
                    key={p}
                    onClick={() => { setPage(p); window.scrollTo(0, 0) }}
                    className={`w-10 h-10 rounded-xl text-sm font-bold transition ${
                      page === p ? 'bg-[#111] text-white' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {p}
                  </motion.button>
                )
              )}
            </div>

            <motion.button
              onClick={() => { setPage(p => p + 1); window.scrollTo(0, 0) }}
              disabled={page * 20 >= totalCount}
              className="px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              →
            </motion.button>
          </div>
        )}
      </div>
    </div>
  )
}