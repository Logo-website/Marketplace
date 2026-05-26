import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import api from '../api'
import ProductCard from '../components/ProductCard'

export default function HomePage() {
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState([])
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    fetchProducts()
  }, [selectedCategory, page])

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchProducts = async () => {
    setLoading(true)
    try {
      let url = `/products/?page=${page}`
      if (selectedCategory) url += `&category=${selectedCategory}`
      const res = await api.get(url)
      setProducts(res.data.results)
      setTotalCount(res.data.count)
    } catch {
      setProducts([])
    } finally {
      setLoading(false)
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

  const handleCategoryChange = (id) => {
    setSelectedCategory(id)
    setPage(1)
    window.scrollTo(0, 0)
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
              <p className="text-gray-400 mb-5">{totalCount > 0 ? `${totalCount.toLocaleString()} товаров` : '728 товаров'} от лучших брендов</p>
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
        <div className="bg-white rounded-2xl p-4 mb-6 border border-gray-100">
          <div className="flex flex-wrap gap-2">
            <motion.button
              onClick={() => handleCategoryChange(null)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                !selectedCategory
                  ? 'bg-[#111] text-white border-[#111]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
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
                  selectedCategory === cat.id
                    ? 'bg-[#111] text-white border-[#111]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
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

        {/* Заголовок */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-black text-[#111]">
              {selectedCategory
                ? categories.find(c => c.id === selectedCategory)?.name
                : 'Все товары'}
            </h2>
            {!loading && (
              <p className="text-sm text-gray-400 mt-0.5">{totalCount.toLocaleString()} товаров</p>
            )}
          </div>
        </div>

        {/* Товары */}
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
          <div className="text-center py-20 bg-white rounded-2xl">
            <p className="text-5xl mb-4">🔍</p>
            <p className="text-gray-400">Товаров не найдено</p>
          </div>
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

        {/* Пагинация */}
        {totalCount > 20 && (
          <div className="flex justify-center items-center gap-2 mt-10">
            <motion.button
              onClick={() => { setPage(p => Math.max(1, p - 1)); window.scrollTo(0, 0) }}
              disabled={page === 1}
              className="px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              ← Назад
            </motion.button>

            <div className="flex gap-1">
              {[...Array(Math.min(5, Math.ceil(totalCount / 20)))].map((_, i) => {
                const pageNum = i + 1
                return (
                  <motion.button
                    key={pageNum}
                    onClick={() => { setPage(pageNum); window.scrollTo(0, 0) }}
                    className={`w-10 h-10 rounded-xl text-sm font-bold transition ${
                      page === pageNum
                        ? 'bg-[#111] text-white'
                        : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'
                    }`}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {pageNum}
                  </motion.button>
                )
              })}
            </div>

            <motion.button
              onClick={() => { setPage(p => p + 1); window.scrollTo(0, 0) }}
              disabled={page * 20 >= totalCount}
              className="px-5 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Вперёд →
            </motion.button>
          </div>
        )}
      </div>
    </div>
  )
}