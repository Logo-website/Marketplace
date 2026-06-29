import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api'
import EmptyState from '../states/EmptyState'
import ErrorState from '../states/ErrorState'
import Icon from '../ui/Icon'
import useAsyncData from '../../hooks/useAsyncData'

// Мои отзывы (Ф10). Форма написания отзыва живёт в карточке товара (Ф4) - здесь
// только список своих отзывов со ссылкой на карточку, без дубля формы.
export default function MyReviewsTab() {
  const navigate = useNavigate()
  const { data, status, retry } = useAsyncData(
    (signal) => api.get('/products/reviews/my/', { signal }).then((r) => r.data.results ?? r.data),
    []
  )
  const reviews = data || []

  if (status === 'loading') {
    return <div className="flex flex-col gap-3">{[...Array(3)].map((_, i) => <div key={i} className="bg-card rounded-2xl h-24 animate-pulse" />)}</div>
  }
  if (status === 'error') return <ErrorState onRetry={retry} />
  if (reviews.length === 0) {
    return (
      <EmptyState
        icon={<Icon name="pencil" className="w-7 h-7 text-ink-faint" />}
        title="Вы ещё не оставляли отзывов"
        subtitle="Отзыв можно оставить на странице купленного товара"
        action={{ label: 'В каталог', onClick: () => navigate('/catalog') }}
      />
    )
  }

  return (
    <motion.div key="reviews" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <h2 className="font-display text-xl font-bold text-ink mb-5">Мои отзывы</h2>
      <div className="flex flex-col gap-3">
        {reviews.map((r) => (
          <Link
            key={r.id}
            to={`/products/${r.product_id}`}
            className="bg-card rounded-2xl border border-line p-5 flex gap-4 hover:border-line-strong transition"
          >
            <div className="w-16 h-16 bg-surface rounded-xl overflow-hidden flex items-center justify-center shrink-0">
              {r.product_image
                ? <img src={r.product_image} alt={r.product_name} className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none' }} />
                : <Icon name="orders" className="w-6 h-6 text-line-strong" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink truncate">{r.product_name}</p>
              <div className="flex gap-0.5 my-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} className={s <= r.rating ? 'text-star' : 'text-line-strong'}>★</span>
                ))}
              </div>
              <p className="text-sm text-ink-faint line-clamp-2">{r.text}</p>
              <p className="text-xs text-ink-faint mt-1">{new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
          </Link>
        ))}
      </div>
    </motion.div>
  )
}
