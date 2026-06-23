import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api'
import useAsyncData from '../hooks/useAsyncData'
import BrandCard from '../components/BrandCard'
import { groupBrandsByLetter } from '../utils/brandGroups'
import { ProductGridSkeleton } from '../components/states/Skeleton'
import EmptyState from '../components/states/EmptyState'
import ErrorState from '../components/states/ErrorState'
import Pagination from '../components/catalog/Pagination'

// Каталог брендов (Ф21, узел 1.22) - второй главный вход в товар «через марку».
// Индекс продавцов с активными товарами: поиск по бренду, переключатель
// «алфавит / по категории», подборки «новые бренды» (sort=new) и «локальные
// марки» (лейбл всего набора - наша фишка позиционирования, план §4.4). Каждая
// карточка ведёт на витрину бренда /brand/:id (Ф20). Публичная, открыта гостю.
//
// Маршрут: /brands.

const PAGE_SIZE = 20 // = DRF PAGE_SIZE
const BRANDS_GRID = 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'

export default function BrandsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') || ''
  const category = searchParams.get('category') || ''
  const view = searchParams.get('view') || 'alpha' // alpha | category
  const page = Math.max(1, Number(searchParams.get('page')) || 1)
  const [searchInput, setSearchInput] = useState(q)

  // Основной список. В обоих режимах сортировка - по алфавиту (узел 1.22):
  // алфавит группирует карточки по букве, «по категории» фильтрует через chips.
  const { data, status, retry } = useAsyncData(
    (signal) => {
      const p = new URLSearchParams()
      if (q) p.set('q', q)
      if (category) p.set('category', category)
      p.set('sort', 'alpha')
      p.set('page', String(page))
      return api.get(`/products/brands/?${p.toString()}`, { signal }).then((r) => r.data)
    },
    [q, category, page]
  )
  const brands = data?.results ?? []
  const totalCount = data?.count ?? 0

  // Категории для режима «по категории» (то же дерево, что каталог-меню Ф1).
  const { data: catData } = useAsyncData(
    (signal) =>
      api.get('/products/categories/', { signal }).then((r) =>
        Array.isArray(r.data) ? r.data : r.data?.results ?? []
      ),
    []
  )
  const categories = catData ?? []

  // Лента «Новые бренды» (sort=new, срез) - только на «чистом» входе (без поиска/
  // фильтра/пагинации), чтобы не дублировать основной список и не путать.
  const showNew = !q && !category && page === 1
  const { data: newData } = useAsyncData(
    (signal) =>
      showNew
        ? api.get('/products/brands/?sort=new', { signal }).then((r) => r.data)
        : Promise.resolve(null),
    [showNew]
  )
  const newBrands = (newData?.results ?? []).slice(0, 6)

  const update = (mutate) => {
    const p = new URLSearchParams(searchParams)
    mutate(p)
    setSearchParams(p)
  }

  const submitSearch = (e) => {
    e.preventDefault()
    update((p) => {
      const v = searchInput.trim()
      if (v) p.set('q', v)
      else p.delete('q')
      p.delete('page')
    })
  }

  const setView = (v) =>
    update((p) => {
      p.set('view', v)
      p.delete('category') // смена режима сбрасывает категорийный фильтр
      p.delete('page')
    })

  const selectCategory = (id) =>
    update((p) => {
      if (String(id) === category) p.delete('category')
      else p.set('category', String(id))
      p.delete('page')
    })

  const handlePage = (pg) =>
    update((p) => {
      if (pg <= 1) p.delete('page')
      else p.set('page', String(pg))
    })

  const groups = view === 'alpha' ? groupBrandsByLetter(brands) : null
  const tabClass = (active) =>
    `px-4 py-2 rounded-xl text-sm font-semibold transition ${
      active ? 'bg-[#111] text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
    }`

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Промо «Локальные марки» - лейбл всего набора (наша фишка, §4.4) */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-gray-900 to-gray-700 rounded-2xl p-6 md:p-8 mb-6 text-white"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-gray-300 mb-1">
            Локальные марки
          </p>
          <h1 className="text-2xl md:text-3xl font-black">Каталог брендов</h1>
          <p className="text-sm text-gray-300 mt-1 max-w-2xl">
            Все марки площадки в одном месте - выбирайте по имени или категории и
            открывайте витрину бренда.
          </p>
        </motion.div>

        {/* Поиск по бренду */}
        <form onSubmit={submitSearch} className="mb-4">
          <div className="relative max-w-xl">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Поиск по бренду"
              className="w-full bg-white rounded-xl pl-4 pr-12 py-3 text-sm border border-gray-200 focus:outline-none focus:border-gray-400 transition"
            />
            <button
              type="submit"
              aria-label="Найти"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 transition"
            >
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        </form>

        {/* Переключатель алфавит / по категории */}
        <div className="flex items-center gap-2 mb-4">
          <button type="button" onClick={() => setView('alpha')} className={tabClass(view === 'alpha')}>
            По алфавиту
          </button>
          <button type="button" onClick={() => setView('category')} className={tabClass(view === 'category')}>
            По категории
          </button>
        </div>

        {/* Чипы категорий (режим «по категории») */}
        {view === 'category' && categories.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-5">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => selectCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  String(cat.id) === category
                    ? 'bg-[#111] text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Подборка «Новые бренды» */}
        {showNew && newBrands.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-black text-[#111] mb-3">Новые бренды</h2>
            <div className={BRANDS_GRID}>
              {newBrands.map((b) => (
                <BrandCard key={b.id} brand={b} />
              ))}
            </div>
          </div>
        )}

        {/* Основной список со состояниями Ф0 */}
        {status === 'loading' && <ProductGridSkeleton count={6} className={BRANDS_GRID} />}
        {status === 'error' && <ErrorState onRetry={retry} />}
        {status === 'ready' && brands.length === 0 && (
          <EmptyState
            icon="🏷️"
            title="Брендов не найдено"
            subtitle={
              q || category
                ? 'Попробуйте изменить запрос или сбросить фильтр по категории'
                : 'Бренды появятся, когда продавцы опубликуют товары'
            }
            action={
              q || category
                ? {
                    label: 'Сбросить',
                    onClick: () => {
                      setSearchInput('') // иначе поле рассинхронено с очищенным URL
                      setSearchParams(new URLSearchParams(view !== 'alpha' ? { view } : {}))
                    },
                  }
                : undefined
            }
          />
        )}

        {status === 'ready' && brands.length > 0 && (
          <>
            {view === 'alpha' ? (
              <div className="flex flex-col gap-8">
                {groups.map((group) => (
                  <div key={group.letter}>
                    <h2 className="text-lg font-black text-gray-300 mb-3">{group.letter}</h2>
                    <div className={BRANDS_GRID}>
                      {group.brands.map((b) => (
                        <BrandCard key={b.id} brand={b} />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={BRANDS_GRID}>
                {brands.map((b) => (
                  <BrandCard key={b.id} brand={b} />
                ))}
              </div>
            )}

            <Pagination
              page={page}
              totalCount={totalCount}
              pageSize={PAGE_SIZE}
              onPageChange={handlePage}
            />
          </>
        )}
      </div>
    </div>
  )
}
