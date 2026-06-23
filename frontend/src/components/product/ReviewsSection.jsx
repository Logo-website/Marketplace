import { useState } from 'react'
import { motion } from 'framer-motion'
import api from '../../api'
import useAsyncData from '../../hooks/useAsyncData'

// Блок отзывов карточки (Ф4). Сам тянет отзывы с сорт/фильтром, показывает
// среднюю + распределение по звёздам и форму «оставить отзыв».
//
// Средняя оценка - из productRating (Product.rating, денормализован сигналом
// P6a), второй раз AVG не считаем (единственный источник правды).
// Gate отзыва: форму показываем всем авторизованным, право проверяет СЕРВЕР
// (403 при не-покупке) - убран хрупкий клиентский предзапрос по 1-й странице
// заказов (план Ф4, решение 7). «Фильтр с фото»/«полезно» - вне Ф4 (нет данных).
const SORTS = [
  { key: 'new', label: 'Сначала новые' },
  { key: 'rating_desc', label: 'Сначала высокие' },
  { key: 'rating_asc', label: 'Сначала низкие' },
]

function Stars({ value }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={`text-sm ${value >= s ? 'text-amber-400' : 'text-gray-200'}`}>★</span>
      ))}
    </div>
  )
}

export default function ReviewsSection({ productId, productRating = 0, reviewsCount = 0, sellerName = '', isAuthenticated, onLoginRequired, onReport }) {
  const [sort, setSort] = useState('new')
  const [ratingFilter, setRatingFilter] = useState(null)

  const [newRating, setNewRating] = useState(0)
  const [newText, setNewText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState('')

  // Отзывы тянем через единый хук Ф0: пересобирается на смену сорта/фильтра,
  // refetch после отправки - через retry(). Гонку ответов хук гасит сам.
  const { data, retry: fetchReviews } = useAsyncData(
    (signal) => {
      const params = new URLSearchParams({ sort })
      if (ratingFilter) params.set('rating', ratingFilter)
      return api.get(`/products/${productId}/reviews/?${params.toString()}`, { signal })
        .then((res) => res.data)
    },
    [productId, sort, ratingFilter]
  )
  const reviews = data?.results || []
  const distribution = data?.distribution || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  const total = typeof data?.count === 'number' ? data.count : reviewsCount

  const handleSubmit = async () => {
    if (newRating === 0) { setReviewError('Поставьте оценку'); return }
    if (!newText.trim()) { setReviewError('Напишите текст отзыва'); return }
    setSubmitting(true)
    setReviewError('')
    try {
      await api.post(`/products/${productId}/reviews/`, { rating: newRating, text: newText })
      setNewRating(0)
      setNewText('')
      setRatingFilter(null)
      setSort('new')
      fetchReviews()
    } catch (err) {
      const status = err.response?.status
      if (status === 403) {
        setReviewError('Отзыв можно оставить только на купленный товар')
      } else if (err.response?.data?.non_field_errors?.[0]) {
        // unique_together(product, user) -> «вы уже оставили отзыв»
        setReviewError(err.response.data.non_field_errors[0])
      } else {
        setReviewError('Не удалось отправить отзыв')
      }
    } finally {
      setSubmitting(false)
    }
  }

  // Сумма по распределению - надёжный total даже до первого ответа с count.
  const distTotal = Object.values(distribution).reduce((a, b) => a + Number(b), 0)
  const totalCount = distTotal || total

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-black text-gray-900">Отзывы</h2>
        {totalCount > 0 && (
          <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2.5 py-1 rounded-lg">
            {totalCount}
          </span>
        )}
      </div>

      {/* Сводка: средняя + распределение по звёздам */}
      {totalCount > 0 && (
        <div className="flex flex-col sm:flex-row gap-6 mb-6 pb-6 border-b border-gray-100">
          <div className="flex flex-col items-center justify-center sm:w-40 shrink-0">
            <span className="text-5xl font-black text-gray-900">
              {Number(productRating).toFixed(1)}
            </span>
            <Stars value={Math.round(productRating)} />
            <span className="text-xs text-gray-400 mt-1">{totalCount} отзывов</span>
          </div>
          <div className="flex-1 flex flex-col gap-1.5 justify-center">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = Number(distribution[star] || 0)
              const pct = totalCount > 0 ? (count / totalCount) * 100 : 0
              const active = ratingFilter === star
              return (
                <button
                  key={star}
                  onClick={() => setRatingFilter(active ? null : star)}
                  className={`flex items-center gap-2 group ${active ? 'opacity-100' : 'opacity-90 hover:opacity-100'}`}
                >
                  <span className="text-xs text-gray-500 w-3 text-right">{star}</span>
                  <span className="text-amber-400 text-xs">★</span>
                  <span className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <span
                      className={`block h-full rounded-full ${active ? 'bg-[#111]' : 'bg-amber-400'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </span>
                  <span className="text-xs text-gray-400 w-7 text-right">{count}</span>
                </button>
              )
            })}
            {ratingFilter && (
              <button
                onClick={() => setRatingFilter(null)}
                className="text-xs text-indigo-600 font-semibold hover:underline mt-1 self-start"
              >
                Сбросить фильтр ({ratingFilter}★)
              </button>
            )}
          </div>
        </div>
      )}

      {/* Сортировка */}
      {totalCount > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          {SORTS.map((s) => (
            <button
              key={s.key}
              onClick={() => setSort(s.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition ${
                sort === s.key
                  ? 'bg-[#111] text-white border-[#111]'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {/* Гость */}
      {!isAuthenticated && (
        <div className="bg-gray-50 rounded-xl p-5 mb-6 border border-gray-100 flex items-center justify-between">
          <p className="text-gray-500 text-sm">Войдите, чтобы оставить отзыв</p>
          <button
            onClick={onLoginRequired}
            className="text-sm text-indigo-600 font-semibold hover:underline shrink-0 ml-4"
          >
            Войти →
          </button>
        </div>
      )}

      {/* Форма (право проверяет сервер при отправке) */}
      {isAuthenticated && (
        <div className="bg-gray-50 rounded-xl p-5 mb-6 border border-gray-100">
          <p className="text-sm font-semibold text-gray-700 mb-3">Оставить отзыв</p>
          <div className="flex gap-0.5 mb-3">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setNewRating(star)}
                aria-label={`Оценка ${star}`}
                className={`text-2xl leading-none transition ${
                  newRating >= star ? 'text-amber-400' : 'text-gray-200 hover:text-amber-200'
                }`}
              >★</button>
            ))}
          </div>
          <textarea
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            placeholder="Напишите ваш отзыв..."
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition resize-none mb-3 bg-white"
            rows={4}
          />
          {reviewError && <p className="text-red-500 text-xs mb-2">{reviewError}</p>}
          <motion.button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-[#111] text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-800 transition disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {submitting ? 'Отправляем...' : 'Отправить'}
          </motion.button>
        </div>
      )}

      {/* Список */}
      {reviews.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-8">
          {ratingFilter ? `Нет отзывов с оценкой ${ratingFilter}★` : 'Отзывов пока нет — будьте первым!'}
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-gray-100">
          {reviews.map((review, i) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3) }}
              className="py-4 first:pt-0 last:pb-0"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600">
                    {review.username?.[0]?.toUpperCase()}
                  </div>
                  <span className="font-semibold text-sm text-gray-800">{review.username}</span>
                </div>
                <span className="text-xs text-gray-400">
                  {review.created_at ? new Date(review.created_at).toLocaleDateString('ru-RU') : ''}
                </span>
              </div>
              <div className="ml-10 mb-2"><Stars value={review.rating} /></div>
              <p className="text-sm text-gray-600 leading-relaxed ml-10">{review.text}</p>

              {/* Пожаловаться на отзыв (Ф18). Уходит модератору в очередь. */}
              {onReport && (
                <button
                  onClick={() => onReport(review.id)}
                  className="ml-10 mt-2 text-xs text-gray-400 hover:text-red-500 transition"
                >
                  Пожаловаться
                </button>
              )}

              {/* Ответ продавца (Ф15, узел 2.8): официальный ответ магазина под
                  отзывом. Имя - sellerName (shop_name, S17), не email. Текст как
                  текст (React экранирует) - без dangerouslySetInnerHTML (XSS). */}
              {review.seller_reply && (
                <div className="ml-10 mt-3 bg-gray-50 border-l-2 border-[#111] rounded-r-xl p-3.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-gray-800">{sellerName || 'Ответ продавца'}</span>
                    <span className="bg-[#111] text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Продавец</span>
                    {review.seller_reply_at && (
                      <span className="text-xs text-gray-400">
                        {new Date(review.seller_reply_at).toLocaleDateString('ru-RU')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{review.seller_reply}</p>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
