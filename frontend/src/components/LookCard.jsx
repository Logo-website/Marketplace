import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

// Карточка образа в ленте (Ф22, узел 1.23) - комплект целиком: фото образа,
// название, источник (редакция / имя бренда), число вещей и сумма комплекта.
// Презентационная: данные приходят пропом, ведёт на карточку образа /looks/:id.
export default function LookCard({ look }) {
  const cover = look.cover
  const price = Number(look.total_price)

  return (
    <Link to={`/looks/${look.id}`} className="block group h-full">
      <motion.div
        whileHover={{ y: -4 }}
        className="bg-white rounded-2xl overflow-hidden border border-gray-100 hover:border-gray-300 hover:shadow-xl transition-all duration-300 flex flex-col h-full"
      >
        {/* Фото образа целиком (не одной вещи). 3:4 - вертикаль под образ. */}
        <div className="relative bg-gray-50 aspect-[3/4] overflow-hidden shrink-0">
          {cover ? (
            <img
              src={cover}
              alt={look.title}
              className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-4xl text-gray-200">👗</div>
          )}
          {/* Бейдж источника: редакция или бренд */}
          <span className="absolute top-3 left-3 bg-white/90 backdrop-blur text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg text-gray-700">
            {look.source === 'editorial' ? 'Редакция' : look.source_name}
          </span>
        </div>

        {/* Контент */}
        <div className="p-4 flex flex-col flex-1">
          <h3 className="font-bold text-gray-900 text-sm line-clamp-2 leading-snug mb-1 group-hover:text-[#111] transition-colors">
            {look.title}
          </h3>
          <p className="text-xs text-gray-400 mb-3">
            {look.items_count} {pluralizeItems(look.items_count)}
          </p>
          <div className="mt-auto flex items-center justify-between pt-2">
            {/* Пустой комплект (все вещи распроданы) - честно «нет в продаже». */}
            {look.items_count > 0 ? (
              <span className="text-lg font-black text-[#111]">
                {price.toLocaleString()} ₽
              </span>
            ) : (
              <span className="text-sm font-semibold text-gray-400">Нет в продаже</span>
            )}
            <span className="text-xs font-semibold text-indigo-500 group-hover:translate-x-0.5 transition-transform">
              Смотреть образ →
            </span>
          </div>
        </div>
      </motion.div>
    </Link>
  )
}

// Склонение «вещь» под число (1 вещь / 2 вещи / 5 вещей).
function pluralizeItems(n) {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'вещь'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'вещи'
  return 'вещей'
}
