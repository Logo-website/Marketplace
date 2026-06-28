import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api'
import useAsyncData from '../hooks/useAsyncData'
import FilterSidebar from '../components/catalog/FilterSidebar'
import ProductGrid from '../components/catalog/ProductGrid'
import SortDropdown from '../components/catalog/SortDropdown'
import Pagination from '../components/catalog/Pagination'
import DidYouMean from '../components/search/DidYouMean'
import SearchEmptyState from '../components/search/SearchEmptyState'

// Страница результатов поиска (узел 1.4, Ф3). Переиспользует узлы Ф2
// (FilterSidebar/ProductGrid/SortDropdown/Pagination) поверх ES-выдачи - «те
// же фильтры, что в каталоге» буквально один и тот же UI. Состояние (q/фильтры/
// сортировка/страница) живёт в URL: ссылка шарится, «назад/вперёд» и refresh
// сохраняют выдачу. Публичная (доступна всем ролям).

const PAGE_SIZE = 20 // = DRF page_size; пагинация не привязана к числу хардкодом

// Опции сортировки поиска: каталожный «популярное» заменён на «по
// релевантности» (дефолт поиска = _score). Прочие - как в каталоге Ф2.
// Иконки задаёт SortDropdown по id опции (бренд-гайд §4), здесь только подписи.
const SEARCH_SORT_OPTIONS = [
  { id: 'relevance', label: 'Релевантность' },
  { id: 'new', label: 'Новинки' },
  { id: 'rating', label: 'По рейтингу' },
  { id: 'price_asc', label: 'Дешевле' },
  { id: 'price_desc', label: 'Дороже' },
]

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // --- Чтение состояния из URL ---
  const query = searchParams.get('q') || ''
  const category = searchParams.get('category')
  const brands = searchParams.getAll('brand')
  const minPrice = searchParams.get('min_price')
  const maxPrice = searchParams.get('max_price')
  const minRating = searchParams.get('min_rating')
  const inStock = searchParams.get('in_stock') === '1'
  const sort = searchParams.get('sort') || 'relevance'
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  // Фильтры (без сортировки/страницы) - идут в запрос выдачи.
  const buildFilterParams = () => {
    const p = new URLSearchParams()
    if (category) p.set('category', category)
    brands.forEach((b) => p.append('brand', b))
    if (minPrice) p.set('min_price', minPrice)
    if (maxPrice) p.set('max_price', maxPrice)
    if (minRating) p.set('min_rating', minRating)
    if (inStock) p.set('in_stock', '1')
    return p
  }

  const urlKey = searchParams.toString()

  // --- Загрузка выдачи (useAsyncData: поздний ответ не перетирает свежий) ---
  const { data, status, retry } = useAsyncData(
    (signal) => {
      // Пустой запрос - не дёргаем ES; показываем приглашение ввести запрос.
      if (!query) {
        return Promise.resolve({
          results: [],
          count: 0,
          facets: {},
          suggestion: null,
          empty_query: true,
        })
      }
      const p = buildFilterParams()
      p.set('q', query)
      p.set('sort', sort)
      p.set('page', String(page))
      p.set('page_size', String(PAGE_SIZE))
      return api.get(`/products/search/?${p.toString()}`, { signal }).then((r) => r.data)
    },
    [query, urlKey]
  )

  const products = data?.results ?? []
  const count = data?.count ?? 0
  const facets = data?.facets ?? {}
  const suggestion = data?.suggestion ?? null

  // Страница за пределами диапазона (шаренная ссылка с &page=999): ES отдаёт
  // count>0, но пустую страницу. Не показываем это как «ничего не найдено» -
  // откатываем на первую (replace, чтобы «назад» не вернул на битую страницу).
  useEffect(() => {
    if (status === 'ready' && count > 0 && products.length === 0 && page > 1) {
      const p = new URLSearchParams(searchParams)
      p.delete('page')
      setSearchParams(p, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // --- Выбранная ценовая корзина: матчим по границам из URL (как каталог) ---
  const norm = (v) => (v == null ? '' : String(v))
  const matchesBucket = (b) =>
    norm(b.from) === norm(minPrice) && norm(b.to) === norm(maxPrice)
  const selectedPriceKey = (facets.price_ranges ?? []).find(matchesBucket)?.key ?? null

  const value = {
    category: category != null ? Number(category) : null,
    brands,
    priceKey: selectedPriceKey,
    minRating: minRating != null ? Number(minRating) : null,
    inStock,
  }

  // Смена фильтра сбрасывает страницу, но сохраняет q/сортировку.
  const updateFilter = (mutator) => {
    const p = new URLSearchParams(searchParams)
    mutator(p)
    p.delete('page')
    setSearchParams(p)
  }

  const handlers = {
    onSelectCategory: (id) =>
      updateFilter((p) => {
        if (norm(category) === norm(id)) p.delete('category')
        else p.set('category', String(id))
      }),
    onToggleBrand: (brand) =>
      updateFilter((p) => {
        const cur = p.getAll('brand')
        p.delete('brand')
        const next = cur.includes(brand) ? cur.filter((b) => b !== brand) : [...cur, brand]
        next.forEach((b) => p.append('brand', b))
      }),
    onSelectPrice: (bucket) =>
      updateFilter((p) => {
        const wasSelected = matchesBucket(bucket)
        p.delete('min_price')
        p.delete('max_price')
        if (!wasSelected) {
          if (bucket.from != null) p.set('min_price', String(bucket.from))
          if (bucket.to != null) p.set('max_price', String(bucket.to))
        }
      }),
    onSelectRating: (v) =>
      updateFilter((p) => {
        if (norm(minRating) === norm(v)) p.delete('min_rating')
        else p.set('min_rating', String(v))
      }),
    onToggleInStock: () =>
      updateFilter((p) => {
        if (inStock) p.delete('in_stock')
        else p.set('in_stock', '1')
      }),
    onReset: () =>
      updateFilter((p) => {
        ;['category', 'brand', 'min_price', 'max_price', 'min_rating', 'in_stock'].forEach((k) =>
          p.delete(k)
        )
      }),
  }

  const handleSort = (id) => {
    const p = new URLSearchParams(searchParams)
    if (id === 'relevance') p.delete('sort')
    else p.set('sort', id)
    p.delete('page')
    setSearchParams(p)
    window.scrollTo(0, 0)
  }

  const handlePage = (pg) => {
    const p = new URLSearchParams(searchParams)
    if (pg <= 1) p.delete('page')
    else p.set('page', String(pg))
    setSearchParams(p)
  }

  // Новый запрос (did-you-mean): свежий URL только с q - фильтры/страница
  // сбрасываются (план Ф3: смена q сбрасывает фильтры).
  const handleSuggestion = (s) => setSearchParams({ q: s })

  const hasFilters =
    category != null ||
    brands.length > 0 ||
    Boolean(minPrice) ||
    Boolean(maxPrice) ||
    Boolean(minRating) ||
    inStock
  const activeFilterCount =
    (category != null ? 1 : 0) +
    brands.length +
    (minPrice || maxPrice ? 1 : 0) +
    (minRating ? 1 : 0) +
    (inStock ? 1 : 0)

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Заголовок + сортировка */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink">
              Результаты поиска:
              <span className="text-accent ml-2">«{query}»</span>
            </h1>
            {query && status === 'ready' && (
              <p className="text-sm text-ink-faint mt-1">
                {count > 0 ? `Найдено ${count.toLocaleString()} товаров` : 'Ничего не найдено'}
              </p>
            )}
          </div>
          {query && <SortDropdown value={sort} onChange={handleSort} options={SEARCH_SORT_OPTIONS} />}
        </div>

        {!query ? (
          <div className="bg-card rounded-2xl border border-line p-12 text-center">
            <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-7 h-7 text-ink-faint" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <p className="text-ink-soft font-semibold">Введите поисковый запрос</p>
          </div>
        ) : (
          <div className="flex flex-col md:flex-row gap-6">
            <FilterSidebar
              facets={facets}
              value={value}
              handlers={handlers}
              status={status}
              mobileOpen={mobileFiltersOpen}
              onMobileClose={() => setMobileFiltersOpen(false)}
            />

            <div className="flex-1 min-w-0">
              {/* Кнопка фильтров - только на мобильном */}
              <button
                onClick={() => setMobileFiltersOpen(true)}
                className="md:hidden mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-line text-sm font-semibold text-ink-soft hover:border-line-strong transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 12h12M10 20h4" />
                </svg>
                Фильтры
                {activeFilterCount > 0 && (
                  <span className="bg-ink text-white text-xs px-1.5 py-0.5 rounded-full">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              {/* Возможно, вы искали - над выдачей, когда результаты есть */}
              {status === 'ready' && products.length > 0 && suggestion && (
                <div className="mb-4">
                  <DidYouMean suggestion={suggestion} onSelect={handleSuggestion} />
                </div>
              )}

              {status === 'ready' && count === 0 ? (
                <SearchEmptyState
                  query={query}
                  suggestion={suggestion}
                  hasFilters={hasFilters}
                  onResetFilters={handlers.onReset}
                  onSelectSuggestion={handleSuggestion}
                />
              ) : (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <ProductGrid
                    products={products}
                    status={status}
                    retry={retry}
                    animationKey={urlKey}
                    skeletonCount={8}
                    gridClassName="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
                  />
                </motion.div>
              )}

              {status === 'ready' && products.length > 0 && (
                <Pagination
                  page={page}
                  totalCount={count}
                  pageSize={PAGE_SIZE}
                  onPageChange={handlePage}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
