import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../../api'
import useAsyncData from '../../hooks/useAsyncData'
import { Skeleton } from '../states/Skeleton'
import ErrorState from '../states/ErrorState'

// Плитки категорий главной (узел 1.2): расфасовка трафика по категориям -
// прямо в критерии «Готово, когда» карты. Грузит то же дерево /products/
// categories/, что каталог-меню Ф1; клик ведёт в выдачу категории /catalog/<id>
// (маршрут Ф2). У категории нет картинки в модели - плитка строится на
// градиенте из палитры (по индексу) + название, без фейковых изображений.

// Палитра фонов плиток - циклически по индексу, чтобы соседние различались.
const TILE_GRADIENTS = [
  'from-[#1a1a2e] to-[#0f3460]',
  'from-[#2d1b69] to-[#1a1a2e]',
  'from-[#0f3460] to-[#1a1a2e]',
  'from-[#3a1c4d] to-[#1a1a2e]',
  'from-[#16213e] to-[#0f3460]',
  'from-[#1f1147] to-[#2d1b69]',
]

export default function CategoryTiles() {
  const { data, status, retry } = useAsyncData(
    (signal) =>
      api
        .get('/products/categories/', { signal })
        .then((r) => (Array.isArray(r.data) ? r.data : r.data?.results ?? [])),
    []
  )
  const categories = data ?? []

  if (status === 'loading') {
    return (
      <section className="mb-10">
        <h2 className="text-xl font-black text-[#111] mb-4">Категории</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-2xl" />
          ))}
        </div>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="mb-10">
        <h2 className="text-xl font-black text-[#111] mb-4">Категории</h2>
        <ErrorState
          className="!py-12"
          subtitle="Не удалось загрузить категории."
          onRetry={retry}
        />
      </section>
    )
  }

  // Категорий нет - секцию не показываем (нет пустой плитки-призрака).
  if (categories.length === 0) return null

  return (
    <section className="mb-10">
      <h2 className="text-xl font-black text-[#111] mb-4">Категории</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {categories.map((cat, i) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.03, 0.3) }}
          >
            <Link
              to={`/catalog/${cat.id}`}
              className={`block h-24 rounded-2xl p-4 bg-gradient-to-br ${
                TILE_GRADIENTS[i % TILE_GRADIENTS.length]
              } relative overflow-hidden hover:opacity-90 transition`}
            >
              <span className="text-white font-bold text-sm leading-snug line-clamp-2">
                {cat.name}
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
