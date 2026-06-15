import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api'
import ProductCard from '../components/ProductCard'

const PAGE_SIZE = 20

// Подпись ценовой корзины из границ from/to (ES возвращает их в фасете).
function priceLabel({ from, to }) {
  const fmt = (n) => Number(n).toLocaleString('ru-RU')
  if (from == null) return `до ${fmt(to)} ₽`
  if (to == null) return `от ${fmt(from)} ₽`
  return `${fmt(from)}–${fmt(to)} ₽`
}

export default function SearchPage() {
  const [searchParams] = useSearchParams()
  const query = searchParams.get('q') || ''

  const [products, setProducts] = useState([])
  const [count, setCount] = useState(0)
  const [facets, setFacets] = useState({ categories: [], price_ranges: [] })
  const [loading, setLoading] = useState(true)

  const [category, setCategory] = useState(null)        // id выбранной категории
  const [priceKey, setPriceKey] = useState(null)        // key выбранной ценовой корзины
  const [page, setPage] = useState(1)

  // Новый запрос - сбрасываем фильтры и страницу.
  useEffect(() => {
    setCategory(null)
    setPriceKey(null)
    setPage(1)
  }, [query])

  useEffect(() => {
    if (query) fetchResults()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, category, priceKey, page])

  const fetchResults = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ q: query, page: String(page), page_size: String(PAGE_SIZE) })
      if (category != null) params.set('category', String(category))
      if (priceKey != null) {
        const bucket = facets.price_ranges.find((b) => b.key === priceKey)
        if (bucket?.from != null) params.set('min_price', String(bucket.from))
        if (bucket?.to != null) params.set('max_price', String(bucket.to))
      }
      const res = await api.get(`/products/search/?${params.toString()}`)
      setProducts(res.data.results || [])
      setCount(res.data.count || 0)
      setFacets(res.data.facets || { categories: [], price_ranges: [] })
    } catch {
      setProducts([])
      setCount(0)
      setFacets({ categories: [], price_ranges: [] })
    } finally {
      setLoading(false)
    }
  }

  const toggleCategory = (id) => {
    setPage(1)
    setCategory((cur) => (cur === id ? null : id))
  }

  const togglePrice = (key) => {
    setPage(1)
    setPriceKey((cur) => (cur === key ? null : key))
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))
  const priceBuckets = facets.price_ranges.filter((b) => b.count > 0 || b.key === priceKey)
  const hasFilters = category != null || priceKey != null

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
              {count > 0 ? `Найдено ${count} товаров` : 'Ничего не найдено'}
            </p>
          )}
        </motion.div>

        <div className="flex flex-col md:flex-row gap-6">

          {/* Сайдбар фасетов */}
          <aside className="md:w-64 shrink-0">
            <div className="bg-white rounded-2xl border border-gray-100 p-5 md:sticky md:top-24">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-900">Фильтры</h2>
                {hasFilters && (
                  <button
                    onClick={() => { setCategory(null); setPriceKey(null); setPage(1) }}
                    className="text-xs text-indigo-600 font-semibold hover:underline"
                  >
                    Сбросить
                  </button>
                )}
              </div>

              {/* Категории */}
              {facets.categories.length > 0 && (
                <div className="mb-5">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Категория</p>
                  <div className="flex flex-col gap-1">
                    {facets.categories.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => toggleCategory(c.id)}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all ${
                          category === c.id
                            ? 'bg-[#111] text-white'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <span className="truncate">{c.name || 'Без категории'}</span>
                        <span className={`text-xs ml-2 shrink-0 ${category === c.id ? 'text-gray-300' : 'text-gray-400'}`}>
                          {c.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Цена */}
              {priceBuckets.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Цена</p>
                  <div className="flex flex-col gap-1">
                    {priceBuckets.map((b) => (
                      <button
                        key={b.key}
                        onClick={() => togglePrice(b.key)}
                        className={`flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all ${
                          priceKey === b.key
                            ? 'bg-[#111] text-white'
                            : 'text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <span>{priceLabel(b)}</span>
                        <span className={`text-xs ml-2 shrink-0 ${priceKey === b.key ? 'text-gray-300' : 'text-gray-400'}`}>
                          {b.count}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {facets.categories.length === 0 && priceBuckets.length === 0 && !loading && (
                <p className="text-sm text-gray-400">Нет доступных фильтров</p>
              )}
            </div>
          </aside>

          {/* Контент */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div
                  key="skeleton"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
                >
                  {[...Array(8)].map((_, i) => (
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
                    {hasFilters
                      ? 'Попробуйте сбросить фильтры или изменить запрос'
                      : `По запросу «${query}» нет результатов — попробуйте другой запрос`}
                  </p>
                </motion.div>
              ) : (
                <motion.div
                  key="results"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
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

            {/* Пагинация */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                >
                  Назад
                </button>
                <span className="text-sm text-gray-500 px-2">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-gray-100 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                >
                  Вперёд
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
