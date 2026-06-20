import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import FilterGroup, { FilterOption } from './FilterGroup'

// Боковой блок фильтров, data-driven от фасетов каталога (Ф2). Группа
// рендерится ТОЛЬКО при наличии непустого фасета: размер/цвет/материал/сезон/
// повод не появляются, пока у товаров нет таких атрибутов (план Ф2, решение 2).
// На мобильном - выезжающая панель (drawer), на десктопе - липкий сайдбар.
//
// Презентационный: value (выбранные значения) и handlers приходят сверху из
// CatalogPage, источник истины - URL. Свой запрос не делает.
//
// Контракт facets (из CatalogFacetsView):
//   { brands:[{value,count}], price_ranges:[{key,from,to,count}],
//     rating_thresholds:[{value,count}], in_stock_count }
// Поиск (Ф3) дополнительно передаёт categories:[{id,name,count}] - в каталоге
// категория задаётся маршрутом, в поиске это data-driven группа фильтра.
//
// value: { brands:string[], priceKey:string|null, minRating:number|null, inStock:bool,
//          category?:id|null }
// handlers: { onToggleBrand(v), onSelectPrice(bucket), onSelectRating(v),
//             onToggleInStock(), onReset(), onSelectCategory?(id) }

const BRAND_VISIBLE = 8 // первые N брендов; остальные - за «показать ещё»

function priceLabel({ from, to }) {
  const fmt = (n) => Number(n).toLocaleString('ru-RU')
  if (from == null) return `до ${fmt(to)} ₽`
  if (to == null) return `от ${fmt(from)} ₽`
  return `${fmt(from)}–${fmt(to)} ₽`
}

function FilterBody({ facets, value, handlers, status }) {
  const [showAllBrands, setShowAllBrands] = useState(false)

  const brands = facets.brands ?? []
  // Категория - только в поиске (Ф3): показываем при наличии или если выбрана.
  const categories = (facets.categories ?? []).filter(
    (c) => c.count > 0 || c.id === value.category
  )
  // Корзину цены показываем, если в ней есть товары ИЛИ она сейчас выбрана
  // (иначе выбранный фильтр исчез бы из списка - нельзя снять).
  const priceBuckets = (facets.price_ranges ?? []).filter(
    (b) => b.count > 0 || b.key === value.priceKey
  )
  const ratingOptions = (facets.rating_thresholds ?? []).filter(
    (r) => r.count > 0 || r.value === value.minRating
  )
  const inStockCount = facets.in_stock_count ?? 0

  const visibleBrands = showAllBrands ? brands : brands.slice(0, BRAND_VISIBLE)
  const hasAny =
    categories.length > 0 ||
    brands.length > 0 ||
    priceBuckets.length > 0 ||
    ratingOptions.length > 0 ||
    inStockCount > 0

  return (
    <>
      {categories.length > 0 && (
        <FilterGroup title="Категория">
          {categories.map((c) => (
            <FilterOption
              key={c.id}
              label={c.name || 'Без категории'}
              count={c.count}
              selected={value.category === c.id}
              onClick={() => handlers.onSelectCategory(c.id)}
            />
          ))}
        </FilterGroup>
      )}

      {priceBuckets.length > 0 && (
        <FilterGroup title="Цена">
          {priceBuckets.map((b) => (
            <FilterOption
              key={b.key}
              label={priceLabel(b)}
              count={b.count}
              selected={value.priceKey === b.key}
              onClick={() => handlers.onSelectPrice(b)}
            />
          ))}
        </FilterGroup>
      )}

      {brands.length > 0 && (
        <FilterGroup title="Бренд">
          {visibleBrands.map((b) => (
            <FilterOption
              key={b.value}
              label={b.value}
              count={b.count}
              selected={value.brands.includes(b.value)}
              onClick={() => handlers.onToggleBrand(b.value)}
            />
          ))}
          {brands.length > BRAND_VISIBLE && (
            <button
              onClick={() => setShowAllBrands((s) => !s)}
              className="text-xs text-indigo-600 font-semibold hover:underline px-3 py-1 text-left"
            >
              {showAllBrands ? 'Свернуть' : `Показать ещё (${brands.length - BRAND_VISIBLE})`}
            </button>
          )}
        </FilterGroup>
      )}

      {ratingOptions.length > 0 && (
        <FilterGroup title="Рейтинг">
          {ratingOptions.map((r) => (
            <FilterOption
              key={r.value}
              label={`от ${r.value}★`}
              count={r.count}
              selected={value.minRating === r.value}
              onClick={() => handlers.onSelectRating(r.value)}
            />
          ))}
        </FilterGroup>
      )}

      {inStockCount > 0 && (
        <FilterGroup title="Наличие">
          <FilterOption
            label="Только в наличии"
            count={inStockCount}
            selected={value.inStock}
            onClick={handlers.onToggleInStock}
          />
        </FilterGroup>
      )}

      {!hasAny && status === 'ready' && (
        <p className="text-sm text-gray-400">Нет доступных фильтров</p>
      )}
    </>
  )
}

export default function FilterSidebar({
  facets = {},
  value,
  handlers,
  status,
  mobileOpen = false,
  onMobileClose,
}) {
  const hasActive =
    value.brands.length > 0 ||
    value.priceKey != null ||
    value.minRating != null ||
    value.inStock ||
    value.category != null

  const resetButton = hasActive && (
    <button
      onClick={handlers.onReset}
      className="text-xs text-indigo-600 font-semibold hover:underline"
    >
      Сбросить
    </button>
  )

  return (
    <>
      {/* Десктоп: липкий сайдбар */}
      <aside className="hidden md:block md:w-64 shrink-0">
        <div className="bg-white rounded-2xl border border-gray-100 p-5 md:sticky md:top-24">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-gray-900">Фильтры</h2>
            {resetButton}
          </div>
          <FilterBody facets={facets} value={value} handlers={handlers} status={status} />
        </div>
      </aside>

      {/* Мобильный drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="md:hidden">
            <motion.div
              className="fixed inset-0 bg-black/40 z-50"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onMobileClose}
            />
            <motion.div
              className="fixed inset-y-0 left-0 w-[85vw] max-w-sm bg-white z-50 overflow-y-auto p-5"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', duration: 0.25 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-gray-900">Фильтры</h2>
                <button
                  onClick={onMobileClose}
                  aria-label="Закрыть фильтры"
                  className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600"
                >
                  ✕
                </button>
              </div>
              {hasActive && (
                <button
                  onClick={handlers.onReset}
                  className="text-xs text-indigo-600 font-semibold hover:underline mb-4 block"
                >
                  Сбросить все
                </button>
              )}
              <FilterBody facets={facets} value={value} handlers={handlers} status={status} />
              <button
                onClick={onMobileClose}
                className="mt-6 w-full px-4 py-3 rounded-xl bg-[#111] text-white text-sm font-semibold"
              >
                Показать результаты
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
