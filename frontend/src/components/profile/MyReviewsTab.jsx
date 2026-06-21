import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../api'
import EmptyState from '../states/EmptyState'
import ErrorState from '../states/ErrorState'
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
    return <div className="flex flex-col gap-3">{[...Array(3)].map((_, i) => <div key={i} className="bg-white rounded-2xl h-24 animate-pulse" />)}</div>
  }
  if (status === 'error') return <ErrorState onRetry={retry} />
  if (reviews.length === 0) {
    return (
      <EmptyState
        icon="✍️"
        title="Вы ещё не оставляли отзывов"
        subtitle="Отзыв можно оставить на странице купленного товара"
        action={{ label: 'В каталог', onClick: () => navigate('/catalog') }}
      />
    )
  }

  return (
    <motion.div key="reviews" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <h2 className="text-xl font-black text-gray-900 mb-5">Мои отзывы</h2>
      <div className="flex flex-col gap-3">
        {reviews.map((r) => (
          <Link
            key={r.id}
            to={`/products/${r.product_id}`}
            className="bg-white rounded-2xl border border-gray-100 p-5 flex gap-4 hover:border-gray-200 transition"
          >
            <div className="w-16 h-16 bg-gray-50 rounded-xl overflow-hidden flex items-center justify-center shrink-0">
              {r.product_image
                ? <img src={r.product_image} alt={r.product_name} className="w-full h-full object-contain" onError={(e) => { e.target.style.display = 'none' }} />
                : <span className="text-2xl">📦</span>}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-800 truncate">{r.product_name}</p>
              <div className="flex gap-0.5 my-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <span key={s} className={s <= r.rating ? 'text-amber-400' : 'text-gray-200'}>★</span>
                ))}
              </div>
              <p className="text-sm text-gray-500 line-clamp-2">{r.text}</p>
              <p className="text-xs text-gray-300 mt-1">{new Date(r.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
          </Link>
        ))}
      </div>
    </motion.div>
  )
}
