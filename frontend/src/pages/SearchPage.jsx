import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api'
import ProductCard from '../components/ProductCard'

export default function SearchPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [sortBy, setSortBy] = useState('')

  useEffect(() => {
    if (query) fetchResults()
  }, [query])

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

  useEffect(() => {
    if (query) fetchResults()
  }, [sortBy])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <h1 className="text-2xl font-black text-gray-800">
            Результаты поиска:
            <span className="text-indigo-600 ml-2">"{query}"</span>
          </h1>
          {!loading && (
            <p className="text-gray-400 text-sm mt-1">
              Найдено {products.length} товаров
            </p>
          )}
        </motion.div>

        {/* Сортировка */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {[
            { value: '', label: '✨ По умолчанию' },
            { value: 'price', label: '💰 Дешевле' },
            { value: '-price', label: '💎 Дороже' },
            { value: '-created_at', label: '🆕 Новинки' },
          ].map((sort) => (
            <motion.button
              key={sort.value}
              onClick={() => setSortBy(sort.value)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                sortBy === sort.value
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                  : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-100'
              }`}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {sort.label}
            </motion.button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
          </div>
        ) : products.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 bg-white rounded-3xl"
          >
            <p className="text-6xl mb-4">🔍</p>
            <p className="text-gray-400 text-lg font-medium">
              Ничего не найдено по запросу "{query}"
            </p>
            <p className="text-gray-300 text-sm mt-2">
              Попробуйте изменить запрос
            </p>
          </motion.div>
        ) : (
          <motion.div
            className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            {products.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
              >
                <ProductCard product={product} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </div>
  )
}