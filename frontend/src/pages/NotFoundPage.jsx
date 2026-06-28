import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
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
          <p className="font-display text-[160px] font-extrabold text-line leading-none select-none">404</p>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-20 h-20 bg-card rounded-2xl border border-line shadow-card flex items-center justify-center">
              <svg className="w-10 h-10 text-ink-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink mb-2">Страница не найдена</h1>
          <p className="text-ink-faint text-sm mb-8">
            Возможно, ссылка устарела или страница была удалена
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <motion.button
              onClick={() => navigate(-1)}
              className="px-6 py-2.5 rounded-xl border border-line text-sm font-semibold text-ink-soft hover:border-line-strong transition bg-card"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              ← Назад
            </motion.button>
            <motion.button
              onClick={() => navigate('/')}
              className="px-6 py-2.5 rounded-xl bg-ink text-white text-sm font-semibold hover:bg-ink/90 transition"
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
