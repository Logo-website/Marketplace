import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api'
import useAsyncData from '../hooks/useAsyncData'
import LookCard from '../components/LookCard'
import { ProductGridSkeleton } from '../components/states/Skeleton'
import EmptyState from '../components/states/EmptyState'
import ErrorState from '../components/states/ErrorState'
import Pagination from '../components/catalog/Pagination'

// Лента образов / лукбук (Ф22, узел 1.23) - главное отличие ниши: не отдельные
// вещи, а собранные образы. Публичная (открыта гостю). Фильтр по источнику
// (все / редакция / бренды). Каждая карточка ведёт на карточку образа /looks/:id.
//
// Маршрут: /looks (и /looks?seller=:id - образы конкретного бренда, вход с Ф20).

const PAGE_SIZE = 20 // = DRF PAGE_SIZE
const LOOKS_GRID = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'

const SOURCE_TABS = [
  { key: '', label: 'Все образы' },
  { key: 'editorial', label: 'Редакция' },
  { key: 'brand', label: 'Бренды' },
]

export default function LooksPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const source = searchParams.get('source') || ''
  const seller = searchParams.get('seller') || ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  const { data, status, retry } = useAsyncData(
    (signal) => {
      const p = new URLSearchParams()
      if (source) p.set('source', source)
      if (seller) p.set('seller', seller)
      p.set('page', String(page))
      return api.get(`/products/looks/?${p.toString()}`, { signal }).then((r) => r.data)
    },
    [source, seller, page]
  )
  const looks = data?.results ?? []
  const totalCount = data?.count ?? 0

  const update = (mutate) => {
    const p = new URLSearchParams(searchParams)
    mutate(p)
    setSearchParams(p)
  }

  const setSource = (key) =>
    update((p) => {
      if (key) p.set('source', key)
      else p.delete('source')
      p.delete('page')
    })

  const handlePage = (pg) =>
    update((p) => {
      if (pg <= 1) p.delete('page')
      else p.set('page', String(pg))
    })

  const tabClass = (active) =>
    `px-4 py-2 rounded-xl text-sm font-semibold transition ${
      active ? 'bg-[#111] text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
    }`

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Промо-шапка лукбука */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-gray-900 to-gray-700 rounded-2xl p-6 md:p-8 mb-6 text-white"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-gray-300 mb-1">
            Готовые образы
          </p>
          <h1 className="text-2xl md:text-3xl font-black">Лукбук</h1>
          <p className="text-sm text-gray-300 mt-1 max-w-2xl">
            Не отдельные вещи, а собранные образы от редакции и брендов. Понравился
            комплект целиком - добавьте его в корзину одним нажатием.
          </p>
        </motion.div>

        {/* Фильтр по источнику. Скрыт при входе «образы бренда» (?seller=) -
            там и так показаны образы одного источника. */}
        {!seller && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {SOURCE_TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => setSource(t.key)} className={tabClass(source === t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Состояния Ф0 */}
        {status === 'loading' && <ProductGridSkeleton count={8} className={LOOKS_GRID} />}
        {status === 'error' && <ErrorState onRetry={retry} />}
        {status === 'ready' && looks.length === 0 && (
          <EmptyState
            icon="👗"
            title="Образов пока нет"
            subtitle={
              source || seller
                ? 'Попробуйте другой источник или загляните позже'
                : 'Редакция и бренды ещё собирают образы - скоро здесь появятся комплекты'
            }
            action={
              source || seller
                ? { label: 'Все образы', onClick: () => setSearchParams(new URLSearchParams()) }
                : undefined
            }
          />
        )}

        {status === 'ready' && looks.length > 0 && (
          <>
            <motion.div
              key={`${source}-${seller}-${page}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2 }}
              className={LOOKS_GRID}
            >
              {looks.map((look) => (
                <LookCard key={look.id} look={look} />
              ))}
            </motion.div>

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
