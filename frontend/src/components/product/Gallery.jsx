import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Галерея карточки товара (Ф4): крупное фото + миниатюры + зум по наведению.
// Презентационный: фото/состояние избранного приходят пропами.
//
// Зум - десктопный (mouse-only): при наведении картинка увеличивается и
// следует за курсором через transform-origin. На тач-устройствах наведения
// нет, поэтому зум не включается и не ломает скролл (граничный случай плана).
// Видео в галерее не рендерим - поля видео в ProductImage нет (вне Ф4).
export default function Gallery({ images = [], name = '', liked = false, onToggleLike }) {
  const [selected, setSelected] = useState(0)
  const [zoom, setZoom] = useState(null) // { x, y } в % или null

  const current = images[selected]
  const src = current?.image_url || current?.image || ''

  const handleMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    setZoom({ x, y })
  }

  return (
    <div className="w-full">
      <div
        className="relative bg-surface rounded-2xl overflow-hidden h-80 md:h-96 mb-3 group"
        onMouseMove={handleMove}
        onMouseLeave={() => setZoom(null)}
      >
        <AnimatePresence mode="wait">
          <motion.img
            key={selected}
            src={src}
            alt={name}
            className="w-full h-full object-contain select-none"
            style={
              zoom
                ? { transform: 'scale(1.9)', transformOrigin: `${zoom.x}% ${zoom.y}%` }
                : { transform: 'scale(1)' }
            }
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            draggable={false}
            onError={(e) => { e.target.src = '' }}
          />
        </AnimatePresence>

        {zoom && (
          <span className="absolute bottom-3 left-3 bg-ink/70 text-white text-[10px] px-2 py-1 rounded-md pointer-events-none">
            Наведите для увеличения
          </span>
        )}

        <motion.button
          onClick={onToggleLike}
          aria-label={liked ? 'Убрать из избранного' : 'В избранное'}
          aria-pressed={liked}
          className={`absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center shadow-card border transition-colors z-10 ${
            liked ? 'bg-accent-soft border-accent/30' : 'bg-card border-line hover:border-line-strong'
          }`}
          whileTap={{ scale: 0.8 }}
        >
          <svg
            className={`w-5 h-5 transition-colors ${liked ? 'text-accent' : 'text-ink-faint'}`}
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
              onClick={() => setSelected(i)}
              className={`shrink-0 w-16 h-16 rounded-xl overflow-hidden border-2 transition-all ${
                selected === i ? 'border-accent' : 'border-transparent hover:border-line-strong'
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
    </div>
  )
}
