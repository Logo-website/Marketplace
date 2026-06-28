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

// Line-иконка-«образы» (sparkles) для пустого состояния (бренд-гайд §4).
const LooksIcon = (
  <svg className="w-7 h-7 text-ink-faint" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456z" />
  </svg>
)

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
      active ? 'bg-ink text-white' : 'bg-card text-ink-soft border border-line hover:border-line-strong'
    }`

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Промо-шапка лукбука - редакционная чернильная панель (стиль PromoBlock
            Ф3 / каталога брендов), не тёмный «AI»-градиент. */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden bg-ink rounded-2xl p-6 md:p-10 mb-6 text-white"
        >
          <div className="relative z-10">
            <p className="text-xs font-bold uppercase tracking-widest text-accent-soft mb-2">
              Готовые образы
            </p>
            <h1 className="font-display text-3xl md:text-4xl font-extrabold tracking-tight">Лукбук</h1>
            <p className="text-sm text-white/70 mt-2 max-w-2xl">
              Не отдельные вещи, а собранные образы от редакции и брендов. Понравился
              комплект целиком - добавьте его в корзину одним нажатием.
            </p>
          </div>
          <div className="pointer-events-none absolute -right-16 -top-16 w-56 h-56 rounded-full border border-white/5" />
          <div className="pointer-events-none absolute -right-4 -bottom-24 w-44 h-44 rounded-full bg-accent/10" />
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
            icon={LooksIcon}
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
