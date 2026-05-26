import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api'
import useCartStore from '../store/cartStore'
import useAuthStore from '../store/authStore'

export default function ProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [product, setProduct] = useState(null)
  const [loading, setLoading] = useState(true)
  const [quantity, setQuantity] = useState(1)
  const [selectedImage, setSelectedImage] = useState(0)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [liked, setLiked] = useState(false)
  const { addToCart } = useCartStore()
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    fetchProduct()
  }, [id])

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

  const handleAddToCart = async () => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
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

  if (loading) return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="bg-white rounded-3xl p-8 flex gap-8">
        <div className="skeleton w-1/2 h-96 rounded-2xl" />
        <div className="flex-1 flex flex-col gap-4">
          <div className="skeleton h-6 rounded-full w-1/3" />
          <div className="skeleton h-8 rounded-full w-full" />
          <div className="skeleton h-8 rounded-full w-3/4" />
          <div className="skeleton h-10 rounded-full w-1/2 mt-4" />
        </div>
      </div>
    </div>
  )

  if (!product) return (
    <div className="text-center py-20">
      <p className="text-6xl mb-4">😕</p>
      <p className="text-gray-400 text-xl">Товар не найден</p>
      <button onClick={() => navigate('/')} className="mt-4 text-indigo-600 hover:underline">
        На главную
      </button>
    </div>
  )

  const rating = product.attributes?.rating || 0
  const reviews = product.attributes?.reviews || 0
  const brand = product.attributes?.brand || ''
  const images = product.images || []

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Хлебные крошки */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-sm text-gray-400 mb-6"
        >
          <button onClick={() => navigate('/')} className="hover:text-indigo-600 transition">Главная</button>
          <span>/</span>
          <span className="text-gray-500">{product.category_name}</span>
          <span>/</span>
          <span className="text-gray-800 font-medium line-clamp-1">{product.name}</span>
        </motion.div>

        <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
          <div className="flex flex-col md:flex-row gap-0">

            {/* Галерея */}
            <motion.div
              initial={{ opacity: 0, x: -30 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full md:w-1/2 p-6"
            >
              <div className="relative bg-gray-50 rounded-2xl overflow-hidden h-80 md:h-96 mb-3">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={selectedImage}
                    src={images[selectedImage]?.image_url || images[selectedImage]?.image || ''}
                    alt={product.name}
                    className="w-full h-full object-cover"
                    initial={{ opacity: 0, scale: 1.05 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    onError={(e) => { e.target.src = '' }}
                  />
                </AnimatePresence>

                <motion.button
                  onClick={() => setLiked(!liked)}
                  className="absolute top-3 right-3 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md"
                  whileTap={{ scale: 0.8 }}
                >
                  <svg
                    className={`w-5 h-5 transition-colors ${liked ? 'text-rose-500 fill-rose-500' : 'text-gray-300'}`}
                    fill={liked ? 'currentColor' : 'none'}
                    stroke="currentColor"
                    viewBox="0 0 24 24"
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
                        selectedImage === i ? 'border-indigo-500' : 'border-transparent'
                      }`}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <img
                        src={img.image_url || img.image}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none' }}
                      />
                    </motion.button>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Информация */}
            <motion.div
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full md:w-1/2 p-6 md:p-8 flex flex-col gap-4"
            >
              {brand && (
                <span className="text-indigo-500 font-bold text-sm uppercase tracking-wider">{brand}</span>
              )}

              <h1 className="text-2xl font-black text-gray-900 leading-tight">{product.name}</h1>

              {rating > 0 && (
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 bg-amber-50 px-3 py-1.5 rounded-xl">
                    <svg className="w-4 h-4 text-amber-400 fill-amber-400" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="font-bold text-amber-700 text-sm">{rating}</span>
                  </div>
                  {reviews > 0 && (
                    <span className="text-gray-400 text-sm">{reviews.toLocaleString()} отзывов</span>
                  )}
                </div>
              )}

              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-black text-gray-900">
                  {Number(product.price).toLocaleString()} ₽
                </span>
              </div>

              {product.description && (
                <p className="text-gray-500 text-sm leading-relaxed border-t border-gray-100 pt-4">
                  {product.description}
                </p>
              )}

              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${product.stock > 0 ? 'bg-emerald-500' : 'bg-red-500'}`} />
                <span className={product.stock > 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
                  {product.stock > 0 ? `В наличии: ${product.stock} шт.` : 'Нет в наличии'}
                </span>
              </div>

              {/* Количество */}
              {product.stock > 0 && (
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500 font-medium">Количество:</span>
                  <div className="flex items-center bg-gray-100 rounded-xl overflow-hidden">
                    <motion.button
                      onClick={() => setQuantity(Math.max(1, quantity - 1))}
                      className="w-10 h-10 flex items-center justify-center hover:bg-gray-200 transition text-lg font-bold text-gray-600"
                      whileTap={{ scale: 0.9 }}
                    >
                      −
                    </motion.button>
                    <span className="w-10 text-center font-bold text-gray-800">{quantity}</span>
                    <motion.button
                      onClick={() => setQuantity(Math.min(product.stock, quantity + 1))}
                      className="w-10 h-10 flex items-center justify-center hover:bg-gray-200 transition text-lg font-bold text-gray-600"
                      whileTap={{ scale: 0.9 }}
                    >
                      +
                    </motion.button>
                  </div>
                </div>
              )}

              {/* Кнопки */}
              <div className="flex gap-3 mt-2">
                <motion.button
                  onClick={handleAddToCart}
                  disabled={product.stock === 0 || adding}
                  className={`flex-1 py-3.5 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2 ${
                    added
                      ? 'bg-emerald-500 text-white'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700'
                  } disabled:opacity-40`}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {adding ? (
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : added ? (
                    <>✓ Добавлено в корзину</>
                  ) : (
                    <>🛒 В корзину</>
                  )}
                </motion.button>
              </div>

              {/* Доп. инфо */}
              <div className="grid grid-cols-3 gap-3 mt-2">
                {[
                  { icon: '🚚', text: 'Быстрая доставка' },
                  { icon: '🔒', text: 'Безопасная оплата' },
                  { icon: '↩️', text: 'Возврат 30 дней' },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    className="bg-gray-50 rounded-xl p-3 text-center"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + i * 0.1 }}
                  >
                    <div className="text-xl mb-1">{item.icon}</div>
                    <p className="text-xs text-gray-500 font-medium">{item.text}</p>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  )
}