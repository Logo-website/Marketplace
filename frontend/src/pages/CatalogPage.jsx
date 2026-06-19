import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api'
import useAsyncData from '../hooks/useAsyncData'
import Breadcrumbs from '../components/catalog/Breadcrumbs'
import FilterSidebar from '../components/catalog/FilterSidebar'
import ProductGrid from '../components/catalog/ProductGrid'
import SortDropdown from '../components/catalog/SortDropdown'
import Pagination from '../components/catalog/Pagination'

// Экран выдачи категории (узел 1.3, Ф2). Состояние - категория/фильтры/
// сортировка/страница - живёт в URL: ссылка шарится, «назад/вперёд» и refresh
// сохраняют выдачу, готова почва под SEO (Ф35). Доступен всем ролям (публичный).
//
// Маршрут: /catalog (все товары) и /catalog/:categoryId (категория).

const PAGE_SIZE = 20 // = DRF PAGE_SIZE; пагинация не привязана к числу хардкодом

// Поиск пути от корня дерева до категории id (для хлебных крошек). Дерево -
// тот же ответ /products/categories/, что и каталог-меню Ф1. Эндпоинта
// «предки категории» в API нет, поэтому путь строим на клиенте (решение 6).
function findPath(nodes, id) {
  for (const node of nodes) {
    if (String(node.id) === String(id)) return [{ id: node.id, name: node.name }]
    if (node.children?.length) {
      const sub = findPath(node.children, id)
      if (sub) return [{ id: node.id, name: node.name }, ...sub]
    }
  }
  return null
}

export default function CatalogPage() {
  const { categoryId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)

  // --- Чтение состояния из URL ---
  const brands = searchParams.getAll('brand')
  const minPrice = searchParams.get('min_price')
  const maxPrice = searchParams.get('max_price')
  const minRating = searchParams.get('min_rating')
  const inStock = searchParams.get('in_stock') === '1'
  const sort = searchParams.get('sort') || 'popular'
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  // Общие фильтры (без сортировки/страницы) - идут и в выдачу, и в фасеты.
  const buildFilterParams = () => {
    const p = new URLSearchParams()
    if (categoryId) p.set('category', categoryId)
    brands.forEach((b) => p.append('brand', b))
    if (minPrice) p.set('min_price', minPrice)
    if (maxPrice) p.set('max_price', maxPrice)
    if (minRating) p.set('min_rating', minRating)
    if (inStock) p.set('in_stock', '1')
    return p
  }

  // Зависимость загрузки - вся строка URL: меняется любой фильтр/сорт/страница -> новый запрос.
  const urlKey = searchParams.toString()

  // --- Загрузка выдачи (useAsyncData: гонка запросов не перетирает свежий ответ) ---
  const { data, status, retry } = useAsyncData(
    (signal) => {
      const p = buildFilterParams()
      p.set('sort', sort)
      p.set('page', String(page))
      return api
        .get(`/products/?${p.toString()}`, { signal })
        .then((r) => r.data)
        .catch((err) => {
          // DRF отдаёт 404 на странице за пределами диапазона. Через UI это
          // недостижимо (кнопки ограничены totalPages), но шаренная ссылка или
          // ручная правка URL могут увести за край - не роняем в ErrorState,
          // помечаем overflow и откатываем на 1-ю страницу (эффект ниже).
          if (err?.response?.status === 404) return { results: [], count: 0, overflow: true }
          throw err
        })
    },
    [categoryId, urlKey]
  )
  const products = data?.results ?? []
  const totalCount = data?.count ?? 0

  // Авто-откат «зависшей» страницы за пределами диапазона на первую (replace -
  // чтобы «назад» не возвращал на битую страницу). Не трогаем page === 1.
  useEffect(() => {
    if (data?.overflow && page > 1) {
      const p = new URLSearchParams(searchParams)
      p.delete('page')
      setSearchParams(p, { replace: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // --- Загрузка фасетов (пересчитываются под текущими фильтрами) ---
  const { data: facetsData } = useAsyncData(
    (signal) =>
      api.get(`/products/facets/?${buildFilterParams().toString()}`, { signal }).then((r) => r.data),
    [categoryId, urlKey]
  )
  const facets = facetsData ?? {
    brands: [],
    price_ranges: [],
    rating_thresholds: [],
    in_stock_count: 0,
  }

  // --- Дерево категорий для хлебных крошек и заголовка ---
  const { data: treeData } = useAsyncData(
    (signal) =>
      api.get('/products/categories/', { signal }).then((r) =>
        Array.isArray(r.data) ? r.data : r.data?.results ?? []
      ),
    []
  )
  const tree = treeData ?? []
  const trail = categoryId ? findPath(tree, categoryId) ?? [] : []
  const categoryNotFound = Boolean(categoryId) && tree.length > 0 && trail.length === 0
  const title = trail.length ? trail[trail.length - 1].name : 'Все товары'

  // --- Выбранная ценовая корзина: матчим по реальным границам из URL ---
  const norm = (v) => (v == null ? '' : String(v))
  const matchesBucket = (b) =>
    norm(b.from) === norm(minPrice) && norm(b.to) === norm(maxPrice)
  const selectedPriceKey = (facets.price_ranges ?? []).find(matchesBucket)?.key ?? null

  const value = {
    brands,
    priceKey: selectedPriceKey,
    minRating: minRating != null ? Number(minRating) : null,
    inStock,
  }

  // --- Запись фильтров в URL. Любая смена фильтра сбрасывает на 1-ю страницу. ---
  const updateFilter = (mutator) => {
    const p = new URLSearchParams(searchParams)
    mutator(p)
    p.delete('page')
    setSearchParams(p)
  }

  const handlers = {
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
        ;['brand', 'min_price', 'max_price', 'min_rating', 'in_stock'].forEach((k) => p.delete(k))
      }),
  }

  const handleSort = (id) => {
    const p = new URLSearchParams(searchParams)
    if (id === 'popular') p.delete('sort')
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

  const hasActiveFilters =
    brands.length > 0 || Boolean(minPrice) || Boolean(maxPrice) || Boolean(minRating) || inStock
  const activeFilterCount =
    brands.length + (minPrice || maxPrice ? 1 : 0) + (minRating ? 1 : 0) + (inStock ? 1 : 0)

  const emptyAction = hasActiveFilters
    ? { label: 'Сбросить фильтры', onClick: handlers.onReset }
    : undefined

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Breadcrumbs trail={trail} />

        {/* Заголовок + сортировка */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-xl font-black text-[#111]">
              {categoryNotFound ? 'Категория не найдена' : title}
            </h1>
            {status === 'ready' && !categoryNotFound && (
              <p className="text-sm text-gray-400 mt-0.5">{totalCount.toLocaleString()} товаров</p>
            )}
          </div>
          <SortDropdown value={sort} onChange={handleSort} />
        </div>

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
              className="md:hidden mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-sm font-semibold text-gray-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 12h12M10 20h4" />
              </svg>
              Фильтры
              {activeFilterCount > 0 && (
                <span className="bg-[#111] text-white text-xs px-1.5 py-0.5 rounded-full">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <ProductGrid
                products={categoryNotFound ? [] : products}
                status={status}
                retry={retry}
                animationKey={urlKey}
                skeletonCount={8}
                gridClassName="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
                emptyTitle={
                  categoryNotFound
                    ? 'Категория не найдена'
                    : hasActiveFilters
                      ? 'Ничего не подошло'
                      : 'Товаров не найдено'
                }
                emptySubtitle={
                  categoryNotFound
                    ? 'Такой категории нет. Откройте общий каталог.'
                    : hasActiveFilters
                      ? 'Попробуйте ослабить или сбросить фильтры'
                      : 'В этой категории пока нет товаров'
                }
                emptyAction={emptyAction}
              />
            </motion.div>

            {status === 'ready' && !categoryNotFound && (
              <Pagination
                page={page}
                totalCount={totalCount}
                pageSize={PAGE_SIZE}
                onPageChange={handlePage}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
