import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MOTION } from '../../lib/motion'
import api from '../../api'
import useAsyncData from '../../hooks/useAsyncData'
import { Skeleton } from '../states/Skeleton'
import ErrorState from '../states/ErrorState'
import CategoryIcon from './categoryIcons'

// Плитки категорий главной (узел 1.2): расфасовка трафика по категориям -
// прямо в критерии «Готово, когда» карты. Грузит то же дерево /products/
// categories/, что каталог-меню Ф1; клик ведёт в выдачу категории /catalog/<id>
// (маршрут Ф2). У категории нет картинки в модели - плитка строится на
// светлой галерейной карточке (бренд-гайд: спокойный грид, без тёмных
// градиентов) + line-иконка-акцент (categoryIcons по имени, fallback -
// вешалка) + название, без фейковых фото товаров.

// Заголовок секции (Bricolage) - один на все состояния, чтобы не плодить дрейф.
const HEADING = (
  <h2 className="mb-4 font-display text-xl md:text-2xl font-bold tracking-tight text-ink">
    Категории
  </h2>
)

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
        {HEADING}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      </section>
    )
  }

  if (status === 'error') {
    return (
      <section className="mb-10">
        {HEADING}
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
      {HEADING}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {categories.map((cat, i) => (
          <motion.div
            key={cat.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...MOTION, delay: Math.min(i * 0.03, 0.3) }}
          >
            <Link
              to={`/catalog/${cat.id}`}
              className="group flex h-28 flex-col justify-between rounded-2xl border border-line bg-surface p-4 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift"
            >
              <CategoryIcon
                name={cat.name}
                className="h-7 w-7 text-accent"
              />
              <span className="font-display text-sm font-bold leading-snug text-ink line-clamp-2 transition-colors group-hover:text-accent">
                {cat.name}
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
