import { useState } from 'react'
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api'
import useAsyncData from '../hooks/useAsyncData'
import useAuthStore from '../store/authStore'
import { toast } from '../store/toastStore'
import FilterSidebar from '../components/catalog/FilterSidebar'
import ProductGrid from '../components/catalog/ProductGrid'
import SortDropdown from '../components/catalog/SortDropdown'
import Pagination from '../components/catalog/Pagination'
import EmptyState from '../components/states/EmptyState'
import ErrorState from '../components/states/ErrorState'
import Card from '../components/ui/Card'

// Line-иконка-витрина для пустого состояния «магазин не найден» (бренд-гайд §4).
const StorefrontIcon = (
  <svg className="w-7 h-7 text-ink-faint" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72M6.75 18h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
  </svg>
)

// Витрина бренда (Ф20, узел 1.21) - публичный экран продавца глазами покупателя:
// шапка (лого/баннер/описание/рейтинг), лента активных товаров с фильтрами/
// сортировкой (как каталог Ф2, через ?seller=), отзывы о продавце (отдельно от
// товарных) и подписка на бренд. Доступна гостю (профиль/лента публичны), мутации
// (отзыв/подписка) - под входом. Образы бренда - forward Ф22 (блок-заглушка).
//
// Маршрут: /brand/:id по user.id продавца.

const PAGE_SIZE = 20 // = DRF PAGE_SIZE

// Склонение «образ» под число (1 образ / 2 образа / 5 образов).
function pluralizeLooks(n) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'образ'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'образа'
  return 'образов'
}

function Stars({ value }) {
  return (
    <div className="flex items-center gap-1">
      <svg className="w-3.5 h-3.5 text-star" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
      </svg>
      <span className="font-semibold text-ink text-sm">{value}</span>
    </div>
  )
}

// Секция отзывов о продавце: публичный список + форма (для авторизованного).
// Право оставить отзыв проверяет бэкенд (купил у продавца, не сам себе, не
// повторно) - фронт показывает форму и обрабатывает 403/400 тостом, как карточка.
function BrandReviews({ brandId, isAuthenticated, onProfileChange }) {
  const navigate = useNavigate()
  const { data, status, retry } = useAsyncData(
    (signal) => api.get(`/products/brand/${brandId}/reviews/`, { signal }).then((r) => r.data),
    [brandId]
  )
  const reviews = data?.results ?? (Array.isArray(data) ? data : [])
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    if (rating < 1) {
      toast.error('Поставьте оценку')
      return
    }
    setSubmitting(true)
    try {
      await api.post(`/products/brand/${brandId}/reviews/`, { rating, text })
      toast.success('Спасибо за отзыв о продавце')
      setRating(0)
      setText('')
      retry()
      onProfileChange?.() // рейтинг продавца в шапке пересчитался - обновить
    } catch (err) {
      const msg = err?.response?.data
      if (err?.response?.status === 403) {
        toast.error(typeof msg?.detail === 'string' ? msg.detail : 'Оставить отзыв можно только после покупки у продавца')
      } else if (err?.response?.status === 400) {
        toast.error(typeof msg?.detail === 'string' ? msg.detail : 'Не удалось сохранить отзыв')
      } else {
        toast.error('Не удалось сохранить отзыв')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="p-6 md:p-8">
      <h2 className="font-display text-xl font-extrabold tracking-tight text-ink mb-4">Отзывы о продавце</h2>

      {/* Форма отзыва */}
      <form onSubmit={submit} className="mb-6 bg-surface rounded-xl p-4 border border-line">
        <div className="flex items-center gap-1 mb-3">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setRating(s)}
              aria-label={`Оценка ${s}`}
              className="p-0.5"
            >
              <svg
                className={`w-6 h-6 ${s <= rating ? 'text-star' : 'text-line-strong'}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </button>
          ))}
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Как прошла покупка: скорость, упаковка, соответствие описанию"
          rows={3}
          maxLength={2000}
          className="w-full rounded-xl border border-line bg-card px-3 py-2 text-sm resize-none focus:outline-none focus:border-line-strong transition"
        />
        <button
          type="submit"
          disabled={submitting}
          className="mt-3 px-5 py-2.5 rounded-xl bg-ink text-white text-sm font-semibold hover:bg-ink/90 transition disabled:opacity-40"
        >
          {isAuthenticated ? 'Оставить отзыв' : 'Войти и оставить отзыв'}
        </button>
      </form>

      {/* Список отзывов */}
      {status === 'loading' && <div className="skeleton h-20 rounded-xl" />}
      {status === 'error' && <ErrorState onRetry={retry} />}
      {status === 'ready' && reviews.length === 0 && (
        <p className="text-sm text-ink-faint">Пока нет отзывов о продавце. Будьте первым.</p>
      )}
      {status === 'ready' && reviews.length > 0 && (
        <div className="flex flex-col gap-4">
          {reviews.map((rev) => (
            <div key={rev.id} className="border-b border-line pb-4 last:border-0">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-sm font-semibold text-ink">{rev.author}</span>
                <Stars value={rev.rating} />
                <span className="text-xs text-ink-faint">
                  {rev.created_at ? new Date(rev.created_at).toLocaleDateString('ru-RU') : ''}
                </span>
              </div>
              {rev.text && <p className="text-sm text-ink-soft whitespace-pre-line">{rev.text}</p>}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export default function BrandPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const { isAuthenticated } = useAuthStore()

  // --- Профиль бренда (шапка) ---
  const { data: brand, status: brandStatus, error: brandError, retry: retryBrand } = useAsyncData(
    (signal) => api.get(`/products/brand/${id}/`, { signal }).then((r) => r.data),
    [id]
  )

  // --- Статус подписки (для кнопки). Гостю бэкенд вернёт following:false. ---
  const { data: followData, setData: setFollowData } = useAsyncData(
    (signal) => api.get(`/products/brand/${id}/follow/`, { signal }).then((r) => r.data),
    [id, isAuthenticated]
  )
  const following = followData?.following ?? false
  const [followBusy, setFollowBusy] = useState(false)

  // --- Образы бренда (Ф22): вход показываем, только если они есть (не мёртвая
  // ссылка, §4.5). Лёгкий запрос - только за наличием/числом. ---
  const { data: looksData } = useAsyncData(
    (signal) => api.get(`/products/looks/?seller=${id}`, { signal }).then((r) => r.data),
    [id]
  )
  const looksCount = looksData?.count ?? 0

  const toggleFollow = async () => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    setFollowBusy(true)
    try {
      const r = await api.post(`/products/brand/${id}/follow/`)
      setFollowData(r.data)
      toast.success(r.data.following ? 'Вы подписались на бренд' : 'Вы отписались от бренда')
    } catch {
      toast.error('Не удалось изменить подписку')
    } finally {
      setFollowBusy(false)
    }
  }

  // --- Состояние ленты в URL (фильтры/сорт/страница), как в каталоге Ф2 ---
  const brands = searchParams.getAll('brand')
  const minPrice = searchParams.get('min_price')
  const maxPrice = searchParams.get('max_price')
  const minRating = searchParams.get('min_rating')
  const inStock = searchParams.get('in_stock') === '1'
  const sort = searchParams.get('sort') || 'popular'
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  const buildFilterParams = () => {
    const p = new URLSearchParams()
    p.set('seller', id)
    brands.forEach((b) => p.append('brand', b))
    if (minPrice) p.set('min_price', minPrice)
    if (maxPrice) p.set('max_price', maxPrice)
    if (minRating) p.set('min_rating', minRating)
    if (inStock) p.set('in_stock', '1')
    return p
  }

  const urlKey = searchParams.toString()

  const { data: listData, status: listStatus, retry: retryList } = useAsyncData(
    (signal) => {
      const p = buildFilterParams()
      p.set('sort', sort)
      p.set('page', String(page))
      return api
        .get(`/products/?${p.toString()}`, { signal })
        .then((r) => r.data)
        .catch((err) => {
          if (err?.response?.status === 404) return { results: [], count: 0 }
          throw err
        })
    },
    [id, urlKey]
  )
  const products = listData?.results ?? []
  const totalCount = listData?.count ?? 0

  const { data: facetsData } = useAsyncData(
    (signal) =>
      api.get(`/products/facets/?${buildFilterParams().toString()}`, { signal }).then((r) => r.data),
    [id, urlKey]
  )
  const facets = facetsData ?? { brands: [], price_ranges: [], rating_thresholds: [], in_stock_count: 0 }

  // --- Связки фильтров с URL (зеркало CatalogPage) ---
  const norm = (v) => (v == null ? '' : String(v))
  const matchesBucket = (b) => norm(b.from) === norm(minPrice) && norm(b.to) === norm(maxPrice)
  const selectedPriceKey = (facets.price_ranges ?? []).find(matchesBucket)?.key ?? null

  const value = {
    brands,
    priceKey: selectedPriceKey,
    minRating: minRating != null ? Number(minRating) : null,
    inStock,
  }

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

  const handleSort = (sid) => {
    const p = new URLSearchParams(searchParams)
    if (sid === 'popular') p.delete('sort')
    else p.set('sort', sid)
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

  // --- Состояния шапки ---
  if (brandStatus === 'loading') {
    return (
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="skeleton h-44 rounded-2xl mb-6" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    )
  }

  if (brandStatus === 'error' && brandError?.response?.status === 404) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <EmptyState
          icon={StorefrontIcon}
          title="Магазин не найден"
          subtitle="Возможно, бренд не существует или больше не работает на площадке"
          action={{ label: 'В каталог', onClick: () => navigate('/catalog') }}
        />
      </div>
    )
  }

  if (brandStatus === 'error') {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <ErrorState onRetry={retryBrand} />
      </div>
    )
  }

  if (!brand) return null

  const hasRating = brand.seller_reviews_count > 0

  return (
    <div className="min-h-screen bg-canvas">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Шапка бренда */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-card rounded-2xl border border-line overflow-hidden mb-6"
        >
          {/* Баннер (или галерейный wash при пустом, бренд §5 - градиент только в баннере) */}
          <div className="h-32 md:h-44 w-full bg-linear-to-br from-accent-soft via-surface to-canvas">
            {brand.banner && (
              <img src={brand.banner} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="p-5 md:p-6 flex flex-col sm:flex-row gap-4 sm:items-center">
            {/* Логотип (или плейсхолдер-инициал) */}
            <div className="w-20 h-20 rounded-2xl bg-card border border-line -mt-12 shadow-card flex items-center justify-center overflow-hidden shrink-0">
              {brand.logo ? (
                <img src={brand.logo} alt={brand.name} className="w-full h-full object-cover" />
              ) : (
                <span className="font-display text-2xl font-extrabold text-ink-faint">
                  {brand.name?.[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-display text-2xl md:text-3xl font-extrabold tracking-tight text-ink">{brand.name}</h1>
                {hasRating ? (
                  <div className="flex items-center gap-2">
                    <Stars value={brand.seller_rating} />
                    <span className="text-sm text-ink-faint">
                      {brand.seller_reviews_count} отзывов о продавце
                    </span>
                  </div>
                ) : (
                  <span className="text-sm text-ink-faint">Нет оценок</span>
                )}
              </div>
              {brand.description && (
                <p className="text-sm text-ink-soft mt-1 max-w-2xl whitespace-pre-line">
                  {brand.description}
                </p>
              )}
              <p className="text-xs text-ink-faint mt-1">{brand.products_count} товаров</p>
            </div>
            {/* Подписка на бренд */}
            <button
              onClick={toggleFollow}
              disabled={followBusy}
              className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition shrink-0 disabled:opacity-40 ${
                following
                  ? 'bg-surface text-ink-soft border border-line hover:bg-line'
                  : 'bg-ink text-white hover:bg-ink/90'
              }`}
            >
              {following ? 'Вы подписаны' : 'Подписаться'}
            </button>
          </div>
        </motion.div>

        {/* Образы бренда (узел 1.23, Ф22) - вход в лукбук этого бренда. Показываем,
            только если у бренда есть опубликованные образы (иначе блок скрыт). */}
        {looksCount > 0 && (
          <Card
            as={Link}
            to={`/looks?seller=${id}`}
            hover
            className="group p-4 mb-6 flex items-center justify-between text-left"
          >
            <span className="text-sm font-semibold text-ink">Образы бренда</span>
            <span className="flex items-center gap-1 text-xs font-semibold text-accent">
              {looksCount} {pluralizeLooks(looksCount)} - смотреть
              <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
              </svg>
            </span>
          </Card>
        )}

        {/* Лента товаров бренда: фильтры/сортировка как в каталоге Ф2 */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="font-display text-xl font-extrabold tracking-tight text-ink">Товары бренда</h2>
          <SortDropdown value={sort} onChange={handleSort} />
        </div>

        <div className="flex flex-col md:flex-row gap-6">
          <FilterSidebar
            facets={facets}
            value={value}
            handlers={handlers}
            status={listStatus}
            mobileOpen={mobileFiltersOpen}
            onMobileClose={() => setMobileFiltersOpen(false)}
          />

          <div className="flex-1 min-w-0">
            <button
              onClick={() => setMobileFiltersOpen(true)}
              className="md:hidden mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-card border border-line text-sm font-semibold text-ink-soft"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h18M6 12h12M10 20h4" />
              </svg>
              Фильтры
            </button>

            <ProductGrid
              products={products}
              status={listStatus}
              retry={retryList}
              animationKey={urlKey}
              skeletonCount={8}
              gridClassName="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
              emptyTitle={hasActiveFilters ? 'Ничего не подошло' : 'У бренда пока нет товаров'}
              emptySubtitle={
                hasActiveFilters
                  ? 'Попробуйте ослабить или сбросить фильтры'
                  : 'Загляните позже - бренд ещё наполняет витрину'
              }
              emptyAction={hasActiveFilters ? { label: 'Сбросить фильтры', onClick: handlers.onReset } : undefined}
            />

            {listStatus === 'ready' && (
              <Pagination
                page={page}
                totalCount={totalCount}
                pageSize={PAGE_SIZE}
                onPageChange={handlePage}
              />
            )}
          </div>
        </div>

        {/* Отзывы о продавце (отдельно от товарных) */}
        <div className="mt-6">
          <BrandReviews
            brandId={id}
            isAuthenticated={isAuthenticated}
            onProfileChange={retryBrand}
          />
        </div>
      </div>
    </div>
  )
}
