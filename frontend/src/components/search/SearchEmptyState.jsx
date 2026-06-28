import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../../api'
import useAsyncData from '../../hooks/useAsyncData'
import DidYouMean from './DidYouMean'

// Не-тупиковое пустое состояние поиска (Ф3, решение 5). Показывает:
//  - did-you-mean (если есть исправление);
//  - «Сбросить фильтры» (если ноль из-за фильтров, а не из-за запроса);
//  - плитки категорий (тот же кэшированный GET /products/categories/, что
//    каталог-меню Ф1) - выход в каталог, чтобы пустой результат не был тупиком.
//
// Названия категорий НЕ ранжируем по популярности (аналитика поиска - Ф33),
// поэтому честно заголовок «Категории», без выдуманного «популярные»
// (правило репо №1 - не выдумывать данные).
const CATEGORY_TILES = 8

export default function SearchEmptyState({
  query,
  suggestion,
  hasFilters,
  onResetFilters,
  onSelectSuggestion,
}) {
  const { data } = useAsyncData(
    (signal) =>
      api.get('/products/categories/', { signal }).then((r) =>
        Array.isArray(r.data) ? r.data : r.data?.results ?? []
      ),
    []
  )
  const categories = (data ?? []).slice(0, CATEGORY_TILES)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card rounded-2xl border border-line p-8 text-center"
    >
      <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center mx-auto mb-4">
        <svg className="w-7 h-7 text-ink-faint" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      </div>
      <h2 className="font-display text-lg font-bold text-ink">
        {hasFilters ? 'Ничего не подошло' : `По запросу «${query}» ничего не найдено`}
      </h2>
      <p className="text-sm text-ink-faint mt-1">
        {hasFilters
          ? 'Попробуйте ослабить или сбросить фильтры'
          : 'Проверьте запрос или загляните в категории ниже'}
      </p>

      {suggestion && (
        <div className="mt-4 flex justify-center">
          <DidYouMean suggestion={suggestion} onSelect={onSelectSuggestion} />
        </div>
      )}

      {hasFilters && (
        <button
          onClick={onResetFilters}
          className="mt-4 px-5 py-2.5 rounded-xl bg-ink text-white text-sm font-semibold hover:bg-ink/90 transition-colors"
        >
          Сбросить фильтры
        </button>
      )}

      {categories.length > 0 && (
        <div className="mt-8">
          <p className="text-xs font-semibold text-ink-faint uppercase tracking-wide mb-3">
            Категории
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {categories.map((c) => (
              <Link
                key={c.id}
                to={`/catalog/${c.id}`}
                className="px-4 py-2 rounded-xl bg-surface hover:bg-accent-soft text-sm font-semibold text-ink-soft hover:text-accent transition-colors"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  )
}
