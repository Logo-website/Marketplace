import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api'
import useCartStore from '../store/cartStore'
import useAuthStore from '../store/authStore'
import useWishlistStore from '../store/wishlistStore'
import useRecentlyViewedStore from '../store/recentlyViewedStore'
import useAsyncData from '../hooks/useAsyncData'
import EmptyState from '../components/states/EmptyState'
import ErrorState from '../components/states/ErrorState'
import { toast } from '../store/toastStore'
import Breadcrumbs from '../components/catalog/Breadcrumbs'
import ProductGrid from '../components/catalog/ProductGrid'
import Gallery from '../components/product/Gallery'
import VariantPicker from '../components/product/VariantPicker'
import SpecsTable from '../components/product/SpecsTable'
import SellerBlock from '../components/product/SellerBlock'
import ReviewsSection from '../components/product/ReviewsSection'
import ProductQA from '../components/product/ProductQA'
import SizeGuideModal from '../components/product/SizeGuideModal'

export default function ProductPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [quantity, setQuantity] = useState(1)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const [selectedSize, setSelectedSize] = useState(null)
  const [selectedColor, setSelectedColor] = useState(null)
  const [sizeHint, setSizeHint] = useState(false)
  const [sizeGuideOpen, setSizeGuideOpen] = useState(false)

  const { addToCart } = useCartStore()
  const { isAuthenticated } = useAuthStore()
  const { toggle, isLiked } = useWishlistStore()

  // Товар - через единый хук: skeleton/404/ошибка сети различаются явно (Ф0).
  const { data: product, status, error, retry } = useAsyncData(
    (signal) => api.get(`/products/${id}/`, { signal }).then((r) => r.data),
    [id]
  )

  // Запись в ленту «вы недавно смотрели» (узел 1.12) - через стор с try/catch,
  // не инлайном (план Ф7, этап 5). Пишем после успешной загрузки товара.
  const addRecentlyViewed = useRecentlyViewedStore((s) => s.add)
  useEffect(() => {
    if (product) addRecentlyViewed(product)
  }, [product, addRecentlyViewed])

  // Лента «с этим покупают» - тот же эндпоинт рекомендаций (item-to-item +
  // fallback по категории), отдельную «похожие» не плодим (план Ф4, решение 9).
  const { data: recsData, status: recsStatus } = useAsyncData(
    (signal) =>
      api.get(`/products/recommendations/?product_id=${id}`, { signal }).then((r) =>
        (r.data || []).filter((p) => p.id !== Number(id))
      ),
    [id]
  )
  const recommendations = recsData || []

  const handleAddToCart = async () => {
    if (!isAuthenticated) { navigate('/login'); return }
    // При наличии размеров выбор обязателен (план Ф4, решение 2).
    if (hasSizes && !selectedSize) {
      setSizeHint(true)
      toast.error('Выберите размер')
      return
    }
    setAdding(true)
    try {
      await addToCart(product.id, quantity, selectedSize)
      setAdded(true)
      setTimeout(() => setAdded(false), 2000)
    } catch {
      toast.error('Ошибка при добавлении в корзину')
    } finally {
      setAdding(false)
    }
  }

  if (status === 'loading') return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="bg-white rounded-2xl p-8 flex flex-col md:flex-row gap-8">
        <div className="skeleton w-full md:w-1/2 h-96 rounded-2xl" />
        <div className="flex-1 flex flex-col gap-4">
          <div className="skeleton h-5 rounded-full w-1/4" />
          <div className="skeleton h-8 rounded-full w-3/4" />
          <div className="skeleton h-10 rounded-full w-1/3 mt-4" />
        </div>
      </div>
    </div>
  )

  // 404 - товара нет (осмысленное «не найдено»); иначе сбой сети с повтором.
  if (status === 'error' && error?.response?.status === 404) return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <EmptyState
        icon={
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
        title="Товар не найден"
        subtitle="Возможно, товар снят с продажи или ссылка устарела"
        action={{ label: 'На главную', onClick: () => navigate('/') }}
      />
    </div>
  )

  if (status === 'error') return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <ErrorState onRetry={retry} />
    </div>
  )

  if (!product) return null

  const attrs = product.attributes || {}
  const brand = attrs.brand || ''
  const images = product.images || []
  const liked = isLiked(product.id)
  const sizes = Array.isArray(attrs.sizes) ? attrs.sizes : null
  const colors = Array.isArray(attrs.colors) ? attrs.colors : null
  const hasSizes = !!(sizes && sizes.length)
  // Ф5: ссылка «Размерная сетка» видна, только если у товара есть сетка
  // (size_group != null - резолв по категории на бэкенде). Для аксессуаров/
  // носков/без категории ссылки нет (не мёртвый контрол).
  const hasSizeChart = !!product.size_group
  const specs = attrs.specs
  const modelParams = attrs.model_params
  const modelRows = modelParams && typeof modelParams === 'object'
    ? Object.entries(modelParams).filter(([k, v]) => k && v != null && String(v).trim() !== '')
    : []
  // Артикул учебного уровня - стабильный slug (или #id), без новой схемы (решение 3).
  const sku = product.slug || `#${product.id}`
  const trail = product.category
    ? [{ id: product.category, name: product.category_name }, { id: 'p', name: product.name }]
    : [{ id: 'p', name: product.name }]

  const onColorSelect = (color) => {
    setSelectedColor(color)
    // product_id - forward-связь вариантов (Ф12); пока null - не навигируем.
    if (color.product_id) navigate(`/products/${color.product_id}`)
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <Breadcrumbs trail={trail} />

        {/* Карточка */}
        <div className="bg-white rounded-2xl overflow-hidden border border-gray-100">
          <div className="flex flex-col md:flex-row">

            {/* Галерея */}
            <motion.div
              initial={{ opacity: 0, x: -24 }}
              animate={{ opacity: 1, x: 0 }}
              className="w-full md:w-1/2 p-6"
            >
              <Gallery
                images={images}
                name={product.name}
                liked={liked}
                onToggleLike={() => toggle(product)}
              />
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

              <div className="flex items-center gap-3 flex-wrap">
                {product.reviews_count > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-amber-50 px-3 py-1.5 rounded-xl">
                      <svg className="w-3.5 h-3.5 text-amber-400 fill-amber-400" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      <span className="font-bold text-amber-700 text-sm">{product.rating}</span>
                    </div>
                    <span className="text-sm text-gray-400">{product.reviews_count.toLocaleString()} отзывов</span>
                  </div>
                )}
                <span className="text-xs text-gray-300">Артикул: {sku}</span>
              </div>

              <div className="text-4xl font-black text-emerald-600">
                {Number(product.price).toLocaleString()} ₽
              </div>

              {product.description && (
                <p className="text-gray-500 text-sm leading-relaxed border-t border-gray-100 pt-4">
                  {product.description}
                </p>
              )}

              {/* Выбор размера/цвета - data-driven (рендерится только при данных) */}
              <VariantPicker
                sizes={sizes}
                colors={colors}
                selectedSize={selectedSize}
                onSelectSize={(s) => { setSelectedSize(s); setSizeHint(false) }}
                selectedColor={selectedColor}
                onSelectColor={onColorSelect}
                onSizeGuide={hasSizeChart ? () => setSizeGuideOpen(true) : undefined}
              />
              {sizeHint && (
                <p className="text-red-500 text-xs -mt-2">Выберите размер перед добавлением в корзину</p>
              )}

              {/* Параметры модели на фото - только при наличии данных */}
              {modelRows.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100 flex flex-wrap gap-x-4 gap-y-1">
                  {modelRows.map(([k, v]) => (
                    <span key={k} className="text-xs text-gray-500">
                      {k}: <span className="text-gray-800 font-medium">{String(v)}</span>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2 text-sm">
                <div className={`w-2 h-2 rounded-full ${product.stock > 0 ? 'bg-emerald-500' : 'bg-red-400'}`} />
                <span className={product.stock > 0 ? 'text-emerald-600 font-medium' : 'text-red-500 font-medium'}>
                  {product.stock > 0 ? `В наличии: ${product.stock} шт.` : 'Нет в наличии'}
                </span>
              </div>

              {/* Ссылка-вход в размерную сетку (Ф5). Когда у товара есть выбор
                  размеров, та же ссылка живёт в VariantPicker - тут не дублируем. */}
              {hasSizeChart && !hasSizes && (
                <button
                  onClick={() => setSizeGuideOpen(true)}
                  className="self-start flex items-center gap-1.5 text-sm text-indigo-600 font-semibold hover:underline"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7M9 6v12" />
                  </svg>
                  Размерная сетка
                </button>
              )}

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
                  added ? 'bg-emerald-500 text-white' : 'bg-[#111] text-white hover:bg-gray-800'
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

              {/* Продавец (имя + forward-заглушки витрины/чата) */}
              <SellerBlock sellerName={product.seller_name} />

              {/* Доставка - честная заглушка до Ф9/Ф32 (без выдуманных сроков) */}
              <div className="flex items-start gap-2.5 bg-gray-50 rounded-xl p-3 border border-gray-100">
                <svg className="w-5 h-5 text-gray-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
                </svg>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Способы и сроки доставки уточняются при оформлении заказа.
                </p>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Характеристики (data-driven) */}
        {specs && Object.keys(specs).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-white rounded-2xl border border-gray-100 mt-4 p-6 md:p-8"
          >
            <h2 className="text-xl font-black text-gray-900 mb-4">Характеристики</h2>
            <SpecsTable specs={specs} />
          </motion.div>
        )}

        {/* Отзывы */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl border border-gray-100 mt-4 overflow-hidden"
        >
          <ReviewsSection
            productId={id}
            productRating={product.rating}
            reviewsCount={product.reviews_count}
            isAuthenticated={isAuthenticated}
            onLoginRequired={() => navigate('/login')}
          />
        </motion.div>

        {/* Вопросы о товаре (Ф6, узел 1.7) - отдельный от отзывов блок */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="bg-white rounded-2xl border border-gray-100 mt-4 overflow-hidden"
        >
          <ProductQA
            productId={id}
            isAuthenticated={isAuthenticated}
            onLoginRequired={() => navigate('/login')}
          />
        </motion.div>

        {/* С этим покупают (узлы Ф2: ProductGrid/ProductCard). Лента
            необязательная: при ошибке/пустоте просто не показываем (graceful). */}
        {(recsStatus === 'loading' || recommendations.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-4"
          >
            <h2 className="text-xl font-black text-gray-900 mb-4">С этим покупают</h2>
            <ProductGrid
              products={recommendations.slice(0, 8)}
              status={recsStatus === 'loading' ? 'loading' : 'ready'}
              skeletonCount={4}
              gridClassName="grid grid-cols-2 md:grid-cols-4 gap-4"
            />
          </motion.div>
        )}
      </div>

      {/* Размерная сетка (Ф5) - модалка поверх карточки */}
      <AnimatePresence>
        {sizeGuideOpen && (
          <SizeGuideModal productId={id} onClose={() => setSizeGuideOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}
