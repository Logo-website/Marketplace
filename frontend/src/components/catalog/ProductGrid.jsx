import { motion, AnimatePresence } from 'framer-motion'
import ProductCard from '../ProductCard'
import { ProductGridSkeleton } from '../states/Skeleton'
import EmptyState from '../states/EmptyState'
import ErrorState from '../states/ErrorState'

// Переиспользуемая сетка карточек товара с состояниями загрузки/пусто/ошибка
// (примитивы Ф0). Презентационный: данные и status приходят пропами, своего
// запроса не делает. Карта Ф2 требует переиспользования в Ф3/Ф7/Ф20 - поэтому
// сетка, скелетон и развод «пусто vs ошибка» собраны в одном узле.
//
// Сетка 1:1 повторяет вёрстку HomePage (2/3/4/5 колонок), чтобы вынос не менял
// внешний вид. Число колонок настраивается через gridClassName (у поиска их 4).
const DEFAULT_GRID =
  'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'

export default function ProductGrid({
  products = [],
  status,
  retry,
  emptyTitle = 'Товаров не найдено',
  emptySubtitle = 'Попробуйте другую категорию или сбросьте фильтры',
  emptyAction,
  emptyIcon = '🔍',
  skeletonCount = 10,
  gridClassName = DEFAULT_GRID,
  animationKey,
}) {
  return (
    <AnimatePresence mode="wait">
      {status === 'loading' ? (
        <motion.div
          key="skeleton"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <ProductGridSkeleton count={skeletonCount} className={gridClassName} />
        </motion.div>
      ) : status === 'error' ? (
        <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <ErrorState onRetry={retry} />
        </motion.div>
      ) : products.length === 0 ? (
        <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <EmptyState
            icon={emptyIcon}
            title={emptyTitle}
            subtitle={emptySubtitle}
            action={emptyAction}
          />
        </motion.div>
      ) : (
        <motion.div
          key={animationKey ?? 'grid'}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className={gridClassName}
        >
          {products.map((product, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              // Капаем задержку, чтобы на большой странице карточки не «доезжали» секундами.
              transition={{ delay: Math.min(i * 0.02, 0.3) }}
            >
              <ProductCard product={product} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
