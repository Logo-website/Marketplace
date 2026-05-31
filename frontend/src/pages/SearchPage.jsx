import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api'
import ProductCard from '../components/ProductCard'

const SORT_OPTIONS = [
  { value: '',          label: 'По умолчанию' },
  { value: 'price',     label: 'Дешевле' },
  { value: '-price',    label: 'Дороже' },
  { value: '-created_at', label: 'Новинки' },
]

export default function SearchPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('')

  useEffect(() => {
    if (query) fetchResults()
  }, [query])

  useEffect(() => {
    if (query) fetchResults()
  }, [sortBy])

  const fetchResults = async () => {
    setLoading(true)
    try {
      let url = `/products/search/?q=${query}`
      if (sortBy) url += `&ordering=${sortBy}`
      const res = await api.get(url)
      setProducts(res.data)
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto px-4 py-8">

        {/* Заголовок */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-2xl font-black text-gray-900">
            Результаты поиска:
            <span className="text-indigo-600 ml-2">«{query}»</span>
          </h1>
          {!loading && (
            <p className="text-sm text-gray-400 mt-1">
              {products.length > 0
                ? `Найдено ${products.length} товаров`
                : 'Ничего не найдено'}
            </p>
          )}
        </motion.div>

        {/* Сортировка */}
        <div className="flex items-center bg-white border border-gray-100 rounded-2xl p-1 gap-1 mb-6 w-fit">
          {SORT_OPTIONS.map((opt) => (
            <motion.button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                sortBy === opt.value
                  ? 'bg-[#111] text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
              }`}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {opt.label}
            </motion.button>
          ))}
        </div>

        {/* Контент */}
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              key="skeleton"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
            >
              {[...Array(10)].map((_, i) => (
                <div key={i} className="bg-white rounded-2xl overflow-hidden">
                  <div className="skeleton h-48 w-full" />
                  <div className="p-4 flex flex-col gap-2">
                    <div className="skeleton h-3 rounded-full w-1/3" />
                    <div className="skeleton h-4 rounded-full w-full" />
                    <div className="skeleton h-6 rounded-full w-1/2 mt-2" />
                  </div>
                </div>
              ))}
            </motion.div>
          ) : products.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-24 bg-white rounded-2xl border border-gray-100"
            >
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="text-gray-700 font-semibold mb-1">Ничего не найдено</p>
              <p className="text-gray-400 text-sm">
                По запросу «{query}» нет результатов — попробуйте другой запрос
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
            >
              {products.map((product, i) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.02 }}
                >
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}