import { motion } from 'framer-motion'

// Окно номеров страниц со сворачиванием середины («1 … 4 5 6 … 20»).
// Вынесено из HomePage без изменения логики.
function getPages(page, totalPages) {
  const pages = []
  const delta = 2
  const left = page - delta
  const right = page + delta + 1
  let last = null
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= left && i < right)) {
      if (last && i - last > 1) pages.push('...')
      pages.push(i)
      last = i
    }
  }
  return pages
}

// Переиспользуемая пагинация. Два режима:
//   mode="numbered" (по умолчанию) - нумерованные страницы (предсказуемо для
//     фильтров и SEO Ф35);
//   mode="loadmore" - кнопка «Показать ещё» (накопительная догрузка).
// pageSize - проп, НЕ хардкод: берётся из DRF page_size, чтобы вынесенный
// компонент не привязывался к числу 20.
export default function Pagination({
  page,
  totalCount,
  pageSize = 20,
  onPageChange,
  mode = 'numbered',
  onLoadMore,
  loadingMore = false,
}) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))

  if (mode === 'loadmore') {
    if (page >= totalPages) return null
    return (
      <div className="flex justify-center mt-10">
        <motion.button
          onClick={onLoadMore}
          disabled={loadingMore}
          className="px-6 py-3 rounded-xl bg-card border border-line text-sm font-semibold text-ink-soft hover:bg-surface hover:border-line-strong disabled:opacity-40 transition-colors"
          whileTap={{ scale: 0.98 }}
        >
          {loadingMore ? 'Загрузка…' : 'Показать ещё'}
        </motion.button>
      </div>
    )
  }

  if (totalPages <= 1) return null

  const go = (p) => {
    onPageChange(p)
    window.scrollTo(0, 0)
  }

  return (
    <div className="flex justify-center items-center gap-1.5 mt-10">
      <motion.button
        onClick={() => go(Math.max(1, page - 1))}
        disabled={page === 1}
        className="px-4 py-2.5 rounded-xl bg-card border border-line text-sm font-semibold text-ink-soft hover:bg-surface hover:border-line-strong disabled:opacity-40 transition-colors"
        whileTap={{ scale: 0.98 }}
        aria-label="Предыдущая страница"
      >
        ←
      </motion.button>

      <div className="flex gap-1">
        {getPages(page, totalPages).map((p, i) =>
          p === '...' ? (
            <span
              key={`dots-${i}`}
              className="w-10 h-10 flex items-center justify-center text-ink-faint text-sm"
            >
              ...
            </span>
          ) : (
            <motion.button
              key={p}
              onClick={() => go(p)}
              className={`w-10 h-10 rounded-xl text-sm font-bold transition-colors ${
                page === p
                  ? 'bg-ink text-white'
                  : 'bg-card text-ink-soft hover:bg-surface border border-line hover:border-line-strong'
              }`}
              whileTap={{ scale: 0.95 }}
            >
              {p}
            </motion.button>
          )
        )}
      </div>

      <motion.button
        onClick={() => go(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="px-4 py-2.5 rounded-xl bg-card border border-line text-sm font-semibold text-ink-soft hover:bg-surface hover:border-line-strong disabled:opacity-40 transition-colors"
        whileTap={{ scale: 0.98 }}
        aria-label="Следующая страница"
      >
        →
      </motion.button>
    </div>
  )
}
