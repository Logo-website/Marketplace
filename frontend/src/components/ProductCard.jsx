import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useState } from 'react'
import useCartStore from '../store/cartStore'
import useWishlistStore from '../store/wishlistStore'
import { toast } from '../store/toastStore'
import Card from './ui/Card'
import Badge from './ui/Badge'

// Атом маркетплейса (Ф4). Gallery Minimal: товар - экспонат на светлом фоне,
// глубина мягкой тенью и подъёмом на hover (примитив Card, бренд-гайд §3) -
// без tilt/glare (решение Ф1, исполнено здесь: react-parallax-tilt снят).
// Цвета - только токены; цена - Bricolage (font-display); бренд-капс - Inter.

// Запасной квадрат, когда у товара нет фото или картинка не загрузилась.
// Line-иконка вместо emoji (бренд-гайд §4). Та же разметка идёт в onError -
// строкой, поэтому держим её здесь единым источником.
const PLACEHOLDER_SVG =
  '<svg class="w-10 h-10 text-line-strong" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"/></svg>'

export default function ProductCard({ product }) {
  const { addToCart } = useCartStore()
  const { toggle, isLiked } = useWishlistStore()
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)

  const liked = isLiked(product.id)
  // Реальный рейтинг из отзывов (P6a); пока отзывов нет - seed-плейсхолдер
  const rating = product.reviews_count > 0 ? product.rating : (product.attributes?.rating || 0)
  const reviews = product.reviews_count || product.attributes?.reviews || 0
  const brand = product.attributes?.brand || ''

  const handleAddToCart = async (e) => {
    e.preventDefault()
    e.stopPropagation()
    // Гостю не редиректим на логин - корзина собирается без входа (Ф8).
    if (adding) return
    setAdding(true)
    try {
      await addToCart(product.id)
      setAdded(true)
      setTimeout(() => setAdded(false), 2000)
    } catch {
      toast.error('Ошибка при добавлении в корзину')
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
    <Card
      as={Link}
      to={`/products/${product.id}`}
      hover
      className="group h-full flex flex-col overflow-hidden"
    >
      {/* Изображение */}
      <div className="relative bg-surface h-48 overflow-hidden shrink-0">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={product.name}
            className="h-full w-full object-contain group-hover:scale-105 transition-transform duration-500"
            onError={(e) => {
              e.target.parentElement.innerHTML =
                `<div class="h-full flex items-center justify-center">${PLACEHOLDER_SVG}</div>`
            }}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-line-strong">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
            </svg>
          </div>
        )}

        {product.stock === 0 && (
          <div className="absolute inset-0 bg-canvas/80 flex items-center justify-center">
            <span className="text-ink-soft font-semibold text-sm border border-line-strong px-3 py-1 rounded-lg">
              Нет в наличии
            </span>
          </div>
        )}

        {product.stock > 0 && product.stock <= 5 && (
          <div className="absolute top-2 left-2">
            <Badge tone="ink">Осталось {product.stock}</Badge>
          </div>
        )}

        <motion.button
          onClick={handleLike}
          aria-label={liked ? 'Убрать из избранного' : 'В избранное'}
          aria-pressed={liked}
          className={`absolute top-2 right-2 w-8 h-8 rounded-full flex items-center justify-center shadow-card border transition-colors ${
            liked
              ? 'bg-accent-soft border-accent/30'
              : 'bg-card border-line hover:border-line-strong'
          }`}
          whileTap={{ scale: 0.8 }}
        >
          <svg
            className={`w-4 h-4 transition-colors ${liked ? 'text-accent' : 'text-ink-soft'}`}
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
          <p className="text-[11px] text-ink-faint font-bold uppercase tracking-widest mb-1">{brand}</p>
        )}

        <h3 className="text-ink text-sm font-medium line-clamp-2 leading-snug mb-2 group-hover:text-accent transition-colors">
          {product.name}
        </h3>

        {rating > 0 && (
          <div className="flex items-center gap-1.5 mb-2">
            <div className="flex">
              {[1,2,3,4,5].map(star => (
                <svg
                  key={star}
                  className={`w-3 h-3 ${star <= Math.round(rating) ? 'text-star' : 'text-line-strong'}`}
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
              ))}
            </div>
            {reviews > 0 && (
              <span className="text-xs text-ink-faint">{reviews.toLocaleString()}</span>
            )}
          </div>
        )}

        <div className="mt-auto pt-2">
          <span className="block font-display text-lg font-bold text-ink whitespace-nowrap mb-2">
            {Number(product.price).toLocaleString()}&nbsp;₽
          </span>
          <motion.button
            onClick={handleAddToCart}
            disabled={product.stock === 0 || adding}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
              added ? 'bg-success text-white' : 'bg-ink text-white hover:bg-ink/90'
            } disabled:opacity-30`}
            whileTap={{ scale: 0.97 }}
          >
            {adding ? (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : added ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Добавлен
              </>
            ) : (
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
    </Card>
  )
}
