import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import ProductCard from '../ProductCard'
import { CardSkeleton } from '../states/Skeleton'
import ErrorState from '../states/ErrorState'

// Единственный кирпич всех лент главной (узел 1.2): «хиты», «новинки»,
// «рекомендуем», «недавно смотрели» - это одна горизонтальная лента карточек
// с разным источником данных (план Ф7, решение 3.2.1). Презентационный:
// данные и status приходят пропами, своего запроса не делает.
//
// Состояния (примитивы Ф0): loading -> горизонтальный скелетон; error ->
// инлайн-блок ошибки с повтором; пустой список -> секция НЕ рендерится
// (нет пустой ленты-призрака, граничный случай плана 5).
//
// Адаптивность (правило 4.2): на мобильном - нативный свайп; на десктопе -
// стрелки прокрутки. Карточки фиксированной ширины в скролл-контейнере.

const CARD_WIDTH = 'w-44 sm:w-52'

export default function ProductRow({
  title,
  products = [],
  status = 'ready',
  seeAllTo,
  onRetry,
  skeletonCount = 6,
}) {
  const scrollRef = useRef(null)

  // Пустая готовая лента не рендерится совсем - нет блока-призрака.
  if (status === 'ready' && products.length === 0) return null

  const scrollBy = (dir) => {
    const el = scrollRef.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-xl md:text-2xl font-bold tracking-tight text-ink">{title}</h2>

        <div className="flex items-center gap-2">
          {seeAllTo && status === 'ready' && (
            <Link
              to={seeAllTo}
              className="group inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-accent transition-colors shrink-0"
            >
              Все
              <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-6-6l6 6-6 6" />
              </svg>
            </Link>
          )}
          {/* Стрелки - только десктоп, мобильный листает свайпом */}
          {status === 'ready' && (
            <div className="hidden md:flex items-center gap-1">
              <button
                type="button"
                aria-label="Назад"
                onClick={() => scrollBy(-1)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-ink-soft transition-colors hover:border-line-strong hover:text-accent"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 12H5m6-6l-6 6 6 6" />
                </svg>
              </button>
              <button
                type="button"
                aria-label="Вперёд"
                onClick={() => scrollBy(1)}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-card text-ink-soft transition-colors hover:border-line-strong hover:text-accent"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-6-6l6 6-6 6" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>

      {status === 'error' ? (
        <ErrorState
          className="!py-12"
          subtitle="Не удалось загрузить эту подборку."
          onRetry={onRetry}
        />
      ) : (
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide snap-x"
        >
          {status === 'loading'
            ? [...Array(skeletonCount)].map((_, i) => (
                <div key={i} className={`${CARD_WIDTH} shrink-0`}>
                  <CardSkeleton />
                </div>
              ))
            : products.map((product, i) => (
                <motion.div
                  key={product.id}
                  className={`${CARD_WIDTH} shrink-0 snap-start`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.03, 0.3) }}
                >
                  <ProductCard product={product} />
                </motion.div>
              ))}
        </div>
      )}
    </section>
  )
}
