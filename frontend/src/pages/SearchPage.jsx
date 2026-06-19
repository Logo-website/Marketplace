import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api'
import ProductCard from '../components/ProductCard'
import useAsyncData from '../hooks/useAsyncData'
import { ProductGridSkeleton } from '../components/states/Skeleton'
import EmptyState from '../components/states/EmptyState'
import ErrorState from '../components/states/ErrorState'

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

  const [category, setCategory] = useState(null)        // id выбранной категории
  const [priceKey, setPriceKey] = useState(null)        // key выбранной ценовой корзины
  const [priceRange, setPriceRange] = useState(null)    // {from,to} выбранной корзины
  const [page, setPage] = useState(1)

  // Новый запрос - сбрасываем фильтры и страницу.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setCategory(null)
    setPriceKey(null)
    setPriceRange(null)
    setPage(1)
  }, [query])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Загрузка результатов через единый хук. Пустой запрос - сразу пустой
  // результат (не вечный скелетон). Границы цены берём из priceRange.
  const { data, status, retry } = useAsyncData(
    (signal) => {
      if (!query) {
        return Promise.resolve({ results: [], count: 0, facets: { categories: [], price_ranges: [] } })
      }
      const params = new URLSearchParams({ q: query, page: String(page), page_size: String(PAGE_SIZE) })
      if (category != null) params.set('category', String(category))
      if (priceRange) {
        if (priceRange.from != null) params.set('min_price', String(priceRange.from))
        if (priceRange.to != null) params.set('max_price', String(priceRange.to))
      }
      return api.get(`/products/search/?${params.toString()}`, { signal }).then((r) => r.data)
    },
    [query, category, priceKey, page]
  )
  const products = data?.results ?? []
  const count = data?.count ?? 0
  const facets = data?.facets ?? { categories: [], price_ranges: [] }

  const toggleCategory = (id) => {
    setPage(1)
    setCategory((cur) => (cur === id ? null : id))
  }

  const togglePrice = (bucket) => {
    setPage(1)
    if (priceKey === bucket.key) {
      setPriceKey(null)
      setPriceRange(null)
    } else {
      setPriceKey(bucket.key)
      setPriceRange({ from: bucket.from, to: bucket.to })
    }
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
          {status === 'ready' && (
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
                    onClick={() => { setCategory(null); setPriceKey(null); setPriceRange(null); setPage(1) }}
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
                        onClick={() => togglePrice(b)}
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

              {facets.categories.length === 0 && priceBuckets.length === 0 && status === 'ready' && (
                <p className="text-sm text-gray-400">Нет доступных фильтров</p>
              )}
            </div>
          </aside>

          {/* Контент */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              {status === 'loading' ? (
                <motion.div
                  key="skeleton"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <ProductGridSkeleton count={8} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" />
                </motion.div>
              ) : status === 'error' ? (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <ErrorState onRetry={retry} />
                </motion.div>
              ) : products.length === 0 ? (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <EmptyState
                    icon={
                      <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                      </svg>
                    }
                    title="Ничего не найдено"
                    subtitle={
                      hasFilters
                        ? 'Попробуйте сбросить фильтры или изменить запрос'
                        : `По запросу «${query}» нет результатов — попробуйте другой запрос`
                    }
                  />
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
            {status === 'ready' && totalPages > 1 && (
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
