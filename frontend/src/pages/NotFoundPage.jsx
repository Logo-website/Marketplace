import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="text-center max-w-md w-full"
      >
        {/* Большая цифра */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.1, type: 'spring' }}
          className="relative mb-8"
        >
          <p className="text-[160px] font-black text-gray-100 leading-none select-none">404</p>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center justify-center">
              <svg className="w-10 h-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h1 className="text-2xl font-black text-gray-900 mb-2">Страница не найдена</h1>
          <p className="text-gray-400 text-sm mb-8">
            Возможно, ссылка устарела или страница была удалена
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <motion.button
              onClick={() => navigate(-1)}
              className="px-6 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition bg-white"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              ← Назад
            </motion.button>
            <motion.button
              onClick={() => navigate('/')}
              className="px-6 py-2.5 rounded-xl bg-[#111] text-white text-sm font-semibold hover:bg-gray-800 transition"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              На главную
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}