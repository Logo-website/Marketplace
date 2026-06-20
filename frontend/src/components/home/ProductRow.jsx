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
        <h2 className="text-xl font-black text-[#111]">{title}</h2>

        <div className="flex items-center gap-2">
          {seeAllTo && status === 'ready' && (
            <Link
              to={seeAllTo}
              className="text-sm font-semibold text-gray-500 hover:text-[#111] transition shrink-0"
            >
              Все →
            </Link>
          )}
          {/* Стрелки - только десктоп, мобильный листает свайпом */}
          {status === 'ready' && (
            <div className="hidden md:flex items-center gap-1">
              <button
                type="button"
                aria-label="Назад"
                onClick={() => scrollBy(-1)}
                className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition"
              >
                ←
              </button>
              <button
                type="button"
                aria-label="Вперёд"
                onClick={() => scrollBy(1)}
                className="w-8 h-8 rounded-full bg-white border border-gray-200 flex items-center justify-center text-gray-600 hover:bg-gray-50 transition"
              >
                →
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
