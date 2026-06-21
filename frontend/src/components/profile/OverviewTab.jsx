import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import api from '../../api'
import ProductCard from '../ProductCard'
import EmptyState from '../states/EmptyState'
import useRecentlyViewedStore from '../../store/recentlyViewedStore'
import useAsyncData from '../../hooks/useAsyncData'

// Дефолтная вкладка кабинета (Ф10) и дом узла 1.12 «недавно просмотренные»
// (план, решение 3.3.4). Фейковый виджет «Оцените покупки» сюда не переносится.
export default function OverviewTab() {
  const navigate = useNavigate()
  // Лента из стора - битый localStorage не валит страницу (Ф7).
  const recentlyViewed = useRecentlyViewedStore((s) => s.items)
  const { data, status } = useAsyncData(
    (signal) =>
      api.get('/products/recommendations/', { signal }).then((r) =>
        Array.isArray(r.data) ? r.data : []
      ),
    []
  )
  const recommendations = data || []

  // Пустое состояние - только когда рекомендации догрузились, иначе оно мелькнёт
  // перед появлением лент.
  if (status !== 'loading' && !recentlyViewed.length && !recommendations.length) {
    return (
      <EmptyState
        icon="🛍️"
        title="Здесь появятся ваши просмотры и рекомендации"
        subtitle="Загляните в каталог - подберём что-нибудь под вас"
        action={{ label: 'В каталог', onClick: () => navigate('/catalog') }}
      />
    )
  }

  return (
    <motion.div
      key="overview"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-6"
    >
      {recentlyViewed.length > 0 && (
        <section className="bg-white rounded-2xl p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-gray-900">Вы смотрели</h2>
            <span className="text-xs text-gray-400">{recentlyViewed.length} товаров</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {recentlyViewed.slice(0, 8).map((product, i) => (
              <motion.div key={product.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}>
                <ProductCard product={product} />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {recommendations.length > 0 && (
        <section className="bg-white rounded-2xl p-6 border border-gray-100">
          <h2 className="text-base font-bold text-gray-900 mb-5">Подобрали для вас</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {recommendations.map((product, i) => (
              <motion.div key={product.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.02 }}>
                <ProductCard product={product} />
              </motion.div>
            ))}
          </div>
        </section>
      )}
    </motion.div>
  )
}
