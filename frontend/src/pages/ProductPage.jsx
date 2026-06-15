import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api'
import ProductCard from '../components/ProductCard'
import useCartStore from '../store/cartStore'
import useAuthStore from '../store/authStore'
import useWishlistStore from '../store/wishlistStore'

const GUARANTEES = [
  {
    label: 'Быстрая доставка',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
      </svg>
    ),
  },
  {
    label: 'Безопасная оплата',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    label: 'Возврат 30 дней',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
]

export default function ProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const [selectedImage, setSelectedImage] = useState(0)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [reviews, setReviews] = useState([])
  const [newRating, setNewRating] = useState(0)
  const [newText, setNewText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState('')
  const [canReview, setCanReview] = useState(null)
  const [recommendations, setRecommendations] = useState([])

  const { addToCart } = useCartStore()
  const { isAuthenticated } = useAuthStore()
  const { toggle, isLiked } = useWishlistStore()

  useEffect(() => {
    fetchProduct()
    fetchReviews()
    fetchRecommendations()
    if (isAuthenticated) checkCanReview()
  }, [id])

  const fetchRecommendations = async () => {
    try {
      const res = await api.get(`/products/recommendations/?product_id=${id}`)
      setRecommendations((res.data || []).filter(p => p.id !== Number(id)))
    } catch {
      setRecommendations([])
    }
  }

  const fetchProduct = async () => {
    try {
      const res = await api.get(`/products/${id}/`)
      setProduct(res.data)
      const viewed = JSON.parse(localStorage.getItem('recently_viewed') || '[]')
      const filtered = viewed.filter(p => p.id !== res.data.id)
      const updated = [res.data, ...filtered].slice(0, 10)
      localStorage.setItem('recently_viewed', JSON.stringify(updated))
    } catch {
      setProduct(null)
    } finally {
      setLoading(false)
    }
  }

  const fetchReviews = async () => {
    try {
      const res = await api.get(`/products/${id}/reviews/`)
      setReviews(res.data.results || res.data)
    } catch {
      setReviews([])
    }
  }

  const checkCanReview = async () => {
    try {
      const res = await api.get('/orders/')
      const orders = res.data.results || []
      const bought = orders.some(order =>
        order.items.some(item => item.product === Number(id))
      )
      setCanReview(bought)
    } catch {
      setCanReview(false)
    }
  }

  const handleAddToCart = async () => {
    if (!isAuthenticated) { navigate('/login'); return }
    setAdding(true)
    try {
      await addToCart(product.id, quantity)
      setAdded(true)
      setTimeout(() => setAdded(false), 2000)
    } catch {
      alert('Ошибка при добавлении')
    } finally {
      setAdding(false)
    }
  }

  const handleSubmitReview = async () => {
    if (newRating === 0) { setReviewError('Поставьте оценку'); return }
    if (!newText.trim()) { setReviewError('Напишите текст отзыва'); return }
    setSubmitting(true)
    setReviewError('')
    try {
      await api.post(`/products/${id}/reviews/`, { rating: newRating, text: newText })
      setNewRating(0)
      setNewText('')
      fetchReviews()
    } catch (err) {
      setReviewError(
        err.response?.status === 403
          ? 'Вы можете оставить отзыв только на купленный товар'
          : err.response?.data?.non_field_errors?.[0] || 'Ошибка при отправке'
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="bg-white rounded-2xl p-8 flex gap-8">
        <div className="skeleton w-1/2 h-96 rounded-2xl" />
        <div className="flex-1 flex flex-col gap-4">
          <div className="skeleton h-5 rounded-full w-1/4" />
          <div className="skeleton h-8 rounded-full w-3/4" />
          <div className="skeleton h-10 rounded-full w-1/3 mt-4" />
        </div>
      </div>
    </div>
  )

  if (!product) return (
    <div className="text-center py-24">
      <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
        <svg className="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <p className="text-gray-500 font-semibold mb-1">Товар не найден</p>
      <button onClick={() => navigate('/')} className="text-sm text-indigo-600 hover:underline mt-1">
        На главную
      </button>
    </div>
  )

  // Реальный рейтинг из отзывов (P6a); пока отзывов нет - seed-плейсхолдер
  const rating = product.reviews_count > 0 ? product.rating : (product.attributes?.rating || 0)
  const reviewCount = product.reviews_count || product.attributes?.reviews || 0
  const brand = product.attributes?.brand || ''
  const images = product.images || []
  const liked = isLiked(product.id)

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Хлебные крошки */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-sm text-gray-400 mb-6"
        >
          <button onClick={() => navigate('/')} className="hover:text-indigo-600 transition">Главная</button>
          <span>/</span>
          <span className="text-gray-500">{product.category_name}</span>
          <span>/</span>
          <span className="text-gray-800 font-medium line-clamp-1">{product.name}</span>
        </motion.div>

        {/* Карточка */}
        <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
          <div className="flex flex-col md:flex-row">

            {/* Галерея */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full md:w-1/2 p-6"
            >
              <div className="relative bg-gray-50 rounded-2xl overflow-hidden h-80 md:h-96 mb-3">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={selectedImage}
                    src={images[selectedImage]?.image_url || images[selectedImage]?.image || ''}
                    alt={product.name}
                    className="w-full h-full object-contain"
                    initial={{ opacity: 0, scale: 1.04 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.25 }}
                    onError={(e) => { e.target.src = '' }}
                  />
                </AnimatePresence>
                <motion.button
                  onClick={() => toggle(product)}
                  className="absolute top-3 right-3 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100"
                  whileTap={{ scale: 0.8 }}
                >
                  <svg
                    className={`w-5 h-5 transition-colors ${liked ? 'text-red-500 fill-red-500' : 'text-gray-300'}`}
                    fill={liked ? 'currentColor' : 'none'}
                    stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </motion.button>
              </div>
              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto scrollbar-hide">
                  {images.map((img, i) => (
                    <motion.button
                      key={i}
                      onClick={() => setSelectedImage(i)}
                      className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                        selectedImage === i ? 'border-indigo-500' : 'border-transparent hover:border-gray-200'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <img src={img.image_url || img.image} alt="" className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none' }} />
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Информация */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full md:w-1/2 p-6 md:p-8 flex flex-col gap-4 border-t md:border-t-0 md:border-l border-gray-100"
            >
              {brand && (
                <span className="text-xs font-bold text-indigo-500 uppercase tracking-widest">{brand}</span>
              )}
              <h1 className="text-2xl font-black text-gray-900 leading-tight">{product.name}</h1>

              {rating > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-xl">
                    <svg className="w-3.5 h-3.5 text-amber-400 fill-amber-400" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="font-bold text-amber-700 text-sm">{rating}</span>
                  </div>
                  {reviewCount > 0 && (
                    <span className="text-sm text-gray-400">{reviewCount.toLocaleString()} отзывов</span>
                  )}
                </div>
              )}

              <div className="text-4xl font-black text-emerald-600">
                {Number(product.price).toLocaleString()} ₽
              </div>

              {product.description && (
                <p className="text-gray-500 text-sm leading-relaxed border-t border-gray-100 pt-4">
                  {product.description}
                </p>
              )}

              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${product.stock > 0 ? 'bg-emerald-500' : 'bg-red-400'}`} />
                <span className={product.stock > 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
                  {product.stock > 0 ? `В наличии: ${product.stock} шт.` : 'Нет в наличии'}
                </span>
              </div>

              {product.stock > 0 && (
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500 font-medium">Количество:</span>
                  <div className="flex items-center bg-gray-100 rounded-xl overflow-hidden">
                    <motion.button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-10 h-10 flex items-center justify-center hover:bg-gray-200 transition font-bold text-gray-600"
                      whileTap={{ scale: 0.9 }}
                    >−</motion.button>
                    <span className="w-10 text-center font-bold text-gray-800 text-sm">{quantity}</span>
                    <motion.button
                      onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                      className="w-10 h-10 flex items-center justify-center hover:bg-gray-200 transition font-bold text-gray-600"
                      whileTap={{ scale: 0.9 }}
                    >+</motion.button>
                  </div>
                </div>
              )}

              <motion.button
                onClick={handleAddToCart}
                disabled={product.stock === 0 || adding}
                className={`py-3.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 ${
                  added
                    ? 'bg-emerald-500 text-white'
                    : 'bg-[#111] text-white hover:bg-gray-800'
                } disabled:opacity-40`}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                {adding ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : added ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Добавлено в корзину
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                    </svg>
                    В корзину
                  </>
                )}
              </motion.button>

              {/* Гарантии */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                {GUARANTEES.map((g, i) => (
                  <motion.div
                    key={g.label}
                    className="bg-gray-50 rounded-xl p-3 flex flex-col items-center text-center gap-1.5 border border-gray-100"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.08 }}
                  >
                    <span className="text-gray-400">{g.icon}</span>
                    <p className="text-xs text-gray-500 font-medium leading-tight">{g.label}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Отзывы */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl border border-gray-100 mt-4 overflow-hidden"
        >
          <div className="p-6 md:p-8">
            <div className="flex items-center gap-3 mb-6">
              <h2 className="text-xl font-black text-gray-900">Отзывы</h2>
              {reviews.length > 0 && (
                <span className="bg-gray-100 text-gray-500 text-xs font-bold px-2.5 py-1 rounded-lg">
                  {reviews.length}
                </span>
              )}
            </div>

            {/* Не авторизован */}
            {!isAuthenticated && (
              <div className="bg-gray-50 rounded-xl p-5 mb-6 border border-gray-100 flex items-center justify-between">
                <p className="text-gray-500 text-sm">Войдите чтобы оставить отзыв</p>
                <button
                  onClick={() => navigate('/login')}
                  className="text-sm text-indigo-600 font-semibold hover:underline shrink-0 ml-4"
                >
                  Войти →
                </button>
              </div>
            )}

            {/* Купил, но не может */}
            {isAuthenticated && canReview === false && (
              <div className="bg-gray-50 rounded-xl p-5 mb-6 border border-gray-100 text-center">
                <p className="text-gray-500 text-sm">Отзыв могут оставить только те, кто купил этот товар</p>
              </div>
            )}

            {/* Форма */}
            {isAuthenticated && canReview === true && (
              <div className="bg-gray-50 rounded-xl p-5 mb-6 border border-gray-100">
                <p className="text-sm font-semibold text-gray-700 mb-3">Оставить отзыв</p>
                <div className="flex gap-0.5 mb-3">
                  {[1,2,3,4,5].map(star => (
                    <button
                      key={star}
                      onClick={() => setNewRating(star)}
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
                  onClick={handleSubmitReview}
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
              <p className="text-gray-400 text-sm text-center py-8">Отзывов пока нет — будьте первым!</p>
            ) : (
              <div className="flex flex-col divide-y divide-gray-100">
                {reviews.map((review, i) => (
                  <motion.div
                    key={review.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
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
                        {new Date(review.created_at).toLocaleDateString('ru-RU')}
                      </span>
                    </div>
                    <div className="flex gap-0.5 mb-2 ml-10">
                      {[1,2,3,4,5].map(star => (
                        <span key={star} className={`text-sm ${review.rating >= star ? 'text-amber-400' : 'text-gray-200'}`}>★</span>
                      ))}
                    </div>
                    <p className="text-sm text-gray-600 leading-relaxed ml-10">{review.text}</p>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>

        {/* С этим покупают (P8: ко-покупки из C++, fallback - популярное по категории) */}
        {recommendations.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-4"
          >
            <h2 className="text-xl font-black text-gray-900 mb-4">С этим покупают</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {recommendations.slice(0, 8).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </motion.div>
        )}

      </div>
    </div>
  )
}