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
      className="bg-white rounded-2xl border border-gray-100 p-8 text-center"
    >
      <div className="text-4xl mb-3">🔍</div>
      <h2 className="text-lg font-black text-gray-900">
        {hasFilters ? 'Ничего не подошло' : `По запросу «${query}» ничего не найдено`}
      </h2>
      <p className="text-sm text-gray-400 mt-1">
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
          className="mt-4 px-5 py-2.5 rounded-xl bg-[#111] text-white text-sm font-semibold hover:bg-black transition"
        >
          Сбросить фильтры
        </button>
      )}

      {categories.length > 0 && (
        <div className="mt-8">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Категории
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {categories.map((c) => (
              <Link
                key={c.id}
                to={`/catalog/${c.id}`}
                className="px-4 py-2 rounded-xl bg-gray-50 hover:bg-gray-100 text-sm font-semibold text-gray-700 transition"
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
