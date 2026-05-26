import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useState } from 'react'
import Tilt from 'react-parallax-tilt'
import useCartStore from '../store/cartStore'
import useAuthStore from '../store/authStore'
import useWishlistStore from '../store/wishlistStore'

export default function ProductCard({ product }) {
  const { addToCart } = useCartStore()
  const { isAuthenticated } = useAuthStore()
  const { toggle, isLiked } = useWishlistStore()
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)

  const liked = isLiked(product.id)
  const rating = product.attributes?.rating || 0
  const reviews = product.attributes?.reviews || 0
  const brand = product.attributes?.brand || ''

  const handleAddToCart = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isAuthenticated) {
      window.location.href = '/login'
      return
    }
    if (adding) return
    setAdding(true)
    try {
      await addToCart(product.id)
      setAdded(true)
      setTimeout(() => setAdded(false), 2000)
    } catch {
      alert('Ошибка при добавлении')
    } finally {
      setAdding(false)
    }
  }

  const handleLike = (e) => {
    e.preventDefault()
    e.stopPropagation()
    toggle(product)
  }

  const imageUrl = product.images?.length > 0
    ? (product.images[0].image_url || product.images[0].image)
    : null

  return (
    <Tilt
      tiltMaxAngleX={5}
      tiltMaxAngleY={5}
      scale={1.01}
      transitionSpeed={400}
      glareEnable={true}
      glareMaxOpacity={0.05}
      glarePosition="all"
      className="h-full"
    >
      <Link to={`/products/${product.id}`} className="block group h-full">
        <div className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:border-gray-300 hover:shadow-xl transition-all duration-300 flex flex-col h-full">

          {/* Изображение */}
          <div className="relative bg-gray-50 h-48 overflow-hidden shrink-0">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt={product.name}
                className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
                onError={(e) => {
                  e.target.parentElement.innerHTML = '<div class="h-full flex items-center justify-center text-4xl text-gray-200">📦</div>'
                }}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-4xl text-gray-200">📦</div>
            )}

            {product.stock === 0 && (
              <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                <span className="text-gray-500 font-semibold text-sm border border-gray-300 px-3 py-1 rounded-lg">
                  Нет в наличии
                </span>
              </div>
            )}

            {product.stock > 0 && product.stock <= 5 && (
              <div className="absolute top-2 left-2">
                <span className="bg-[#111] text-white text-xs px-2 py-1 rounded-lg font-medium">
                  Осталось {product.stock}
                </span>
              </div>
            )}

            <motion.button
              onClick={handleLike}
              className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center shadow-sm border transition-all ${
                liked
                  ? 'bg-red-50 border-red-200'
                  : 'bg-white border-gray-300'
              }`}
              whileTap={{ scale: 0.8 }}
            >
              <svg
                className={`w-4 h-4 transition-colors ${liked ? 'text-red-500 fill-red-500' : 'text-gray-700'}`}
                fill={liked ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </motion.button>
          </div>

          {/* Контент */}
          <div className="p-4 flex flex-col flex-1">
            {brand && (
              <p className="text-xs text-gray-400 font-medium uppercase tracking-wide mb-1">{brand}</p>
            )}

            <h3 className="font-semibold text-gray-800 text-sm line-clamp-2 leading-snug mb-2 group-hover:text-[#111] transition-colors">
              {product.name}
            </h3>

            {rating > 0 && (
              <div className="flex items-center gap-1.5 mb-2">
                <div className="flex">
                  {[1,2,3,4,5].map(star => (
                    <svg
                      key={star}
                      className={`w-3 h-3 ${star <= Math.round(rating) ? 'text-amber-400' : 'text-gray-200'}`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                {reviews > 0 && (
                  <span className="text-xs text-gray-400">{reviews.toLocaleString()}</span>
                )}
              </div>
            )}

            <div className="flex items-center justify-between mt-auto pt-2">
              <span className="text-lg font-black text-[#111]">
                {Number(product.price).toLocaleString()} ₽
              </span>
              <motion.button
                onClick={handleAddToCart}
                disabled={product.stock === 0 || adding}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                  added ? 'bg-green-500 text-white' : 'bg-[#111] text-white hover:bg-gray-800'
                } disabled:opacity-30`}
                whileTap={{ scale: 0.9 }}
              >
                {adding ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : added ? <>✓ Добавлен</> : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    В корзину
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </div>
      </Link>
    </Tilt>
  )
}