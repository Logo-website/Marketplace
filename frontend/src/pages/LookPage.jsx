import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api'
import useAsyncData from '../hooks/useAsyncData'
import useCartStore from '../store/cartStore'
import useAuthStore from '../store/authStore'
import { toast } from '../store/toastStore'
import ProductGrid from '../components/catalog/ProductGrid'
import EmptyState from '../components/states/EmptyState'
import ErrorState from '../components/states/ErrorState'

// Карточка образа (Ф22, узел 1.23) - фото комплекта, все вещи с переходом на
// каждый товар (через ProductCard в ProductGrid), сумма комплекта и кнопка
// «добавить весь образ в корзину». Публичная (открыта гостю); добавление - под
// входом (батч-эндпоинт IsAuthenticated), гостя ведём на логин.
//
// Маршрут: /looks/:id.

export default function LookPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()
  const { addLookToCart } = useCartStore()
  const [adding, setAdding] = useState(false)

  const { data: look, status, error, retry } = useAsyncData(
    (signal) => api.get(`/products/looks/${id}/`, { signal }).then((r) => r.data),
    [id]
  )

  const handleAddLook = async () => {
    // Гостя - на логин (в отличие от одиночного добавления, батч требует входа).
    if (!isAuthenticated) {
      navigate(`/login?next=${encodeURIComponent(`/looks/${id}`)}`)
      return
    }
    setAdding(true)
    try {
      const { added, skipped } = await addLookToCart(id)
      const total = added.length + skipped.length
      if (added.length === 0) {
        toast.error('Все вещи образа сейчас недоступны')
      } else if (skipped.length > 0) {
        toast.success(`Добавлено ${added.length} из ${total}, остальные недоступны`)
      } else {
        toast.success('Образ добавлен в корзину')
      }
    } catch {
      toast.error('Не удалось добавить образ в корзину')
    } finally {
      setAdding(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl p-8 flex flex-col md:flex-row gap-8">
          <div className="skeleton w-full md:w-1/2 h-96 rounded-2xl" />
          <div className="flex-1 flex flex-col gap-4">
            <div className="skeleton h-8 rounded-full w-3/4" />
            <div className="skeleton h-5 rounded-full w-1/2" />
            <div className="skeleton h-12 rounded-xl w-full mt-4" />
          </div>
        </div>
      </div>
    )
  }

  if (status === 'error' && error?.response?.status === 404) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <EmptyState
          icon="👗"
          title="Образ не найден"
          subtitle="Возможно, образ снят с публикации или ссылка устарела"
          action={{ label: 'Все образы', onClick: () => navigate('/looks') }}
        />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <ErrorState onRetry={retry} />
      </div>
    )
  }

  if (!look) return null

  const products = look.products || []
  const hasActive = products.length > 0
  const price = Number(look.total_price)
  // Источник: бренд ведёт на витрину Ф20, редакция - наш лейбл без ссылки.
  const isBrand = look.source === 'brand' && look.seller_id

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
          <div className="flex flex-col md:flex-row">
            {/* Фото образа целиком */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full md:w-1/2 bg-gray-50"
            >
              {look.cover ? (
                <img src={look.cover} alt={look.title} className="w-full h-full max-h-[560px] object-cover" />
              ) : (
                <div className="h-96 flex items-center justify-center text-6xl text-gray-200">👗</div>
              )}
            </motion.div>

            {/* Инфо об образе */}
            <motion.div
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full md:w-1/2 p-6 md:p-8 flex flex-col gap-4 border-t md:border-t-0 md:border-l border-gray-100"
            >
              <span className="text-xs font-bold text-indigo-500 uppercase tracking-widest">
                {look.source === 'editorial' ? 'Подборка редакции' : 'Образ бренда'}
              </span>
              <h1 className="text-2xl font-black text-gray-900 leading-tight">{look.title}</h1>

              {isBrand && (
                <Link to={`/brand/${look.seller_id}`} className="text-sm font-semibold text-gray-600 hover:text-[#111] hover:underline self-start">
                  {look.source_name} →
                </Link>
              )}

              {look.description && (
                <p className="text-gray-500 text-sm leading-relaxed border-t border-gray-100 pt-4 whitespace-pre-line">
                  {look.description}
                </p>
              )}

              <div className="border-t border-gray-100 pt-4">
                <p className="text-sm text-gray-500 mb-1">
                  {hasActive ? 'Сумма комплекта' : 'Образ временно недоступен'}
                </p>
                {hasActive ? (
                  <div className="text-3xl font-black text-emerald-600">
                    {price.toLocaleString()} ₽
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">Вещи этого образа сейчас не в продаже</p>
                )}
              </div>

              <motion.button
                onClick={handleAddLook}
                disabled={!hasActive || adding}
                className="py-3.5 rounded-xl font-bold text-sm bg-[#111] text-white hover:bg-gray-800 transition-all flex items-center justify-center gap-2 disabled:opacity-40"
                whileHover={{ scale: hasActive ? 1.01 : 1 }}
                whileTap={{ scale: hasActive ? 0.98 : 1 }}
              >
                {adding ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                    </svg>
                    {isAuthenticated ? 'Добавить весь образ в корзину' : 'Войти и добавить образ'}
                  </>
                )}
              </motion.button>
            </motion.div>
          </div>
        </div>

        {/* Вещи образа - переход на каждый товар через ProductCard (Ф2/Ф4) */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-6"
        >
          <h2 className="text-xl font-black text-gray-900 mb-4">Вещи в образе</h2>
          {hasActive ? (
            <ProductGrid
              products={products}
              status="ready"
              gridClassName="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4"
            />
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-400">
              Вещи этого образа сейчас недоступны.
            </div>
          )}
        </motion.div>
      </div>
    </div>
  )
}
