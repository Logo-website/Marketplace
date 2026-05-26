import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import useWishlistStore from '../store/wishlistStore'
import ProductCard from '../components/ProductCard'

export default function WishlistPage() {
  const { items } = useWishlistStore()
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-[#111]">Избранное</h1>
            <p className="text-sm text-gray-400 mt-0.5">{items.length} товаров</p>
          </div>
        </div>

        {items.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 bg-white rounded-2xl"
          >
            <p className="text-6xl mb-4">🤍</p>
            <p className="text-gray-400 text-lg font-medium">Избранное пусто</p>
            <p className="text-gray-300 text-sm mt-1 mb-6">Добавляйте товары нажав на ❤️</p>
            <motion.button
              onClick={() => navigate('/')}
              className="bg-[#111] text-white px-6 py-3 rounded-xl font-semibold hover:bg-gray-800 transition"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              Перейти в каталог
            </motion.button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            <AnimatePresence>
              {items.map((product, i) => (
                <motion.div
                  key={product.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <ProductCard product={product} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  )
}