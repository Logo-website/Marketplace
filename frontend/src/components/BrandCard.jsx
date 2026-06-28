import { Link } from 'react-router-dom'
import Card from './ui/Card'

// Карточка бренда в каталоге (Ф21, узел 1.22). Презентационная: данные приходят
// пропом, клик ведёт на витрину бренда /brand/:id (Ф20). Имя/описание выводятся
// как ТЕКСТ (React экранирует, XSS §9). reviews_count=0 -> «Нет оценок» (а не
// «0.0»): один источник истины рейтинга с витриной (seller_rating, план §4.2).
// Gallery Minimal (Ф8): примитив Card + подъём на hover (вместо whileHover),
// рейтинг - text-star, цвета только токены.
export default function BrandCard({ brand }) {
  const hasRating = brand.reviews_count > 0
  return (
    <Card as={Link} to={`/brand/${brand.id}`} hover className="group h-full p-5 flex items-center gap-4">
      {/* Логотип (магазина или аватар), при отсутствии - инициал */}
      <div className="w-14 h-14 rounded-2xl bg-surface border border-line flex items-center justify-center overflow-hidden shrink-0">
        {brand.logo ? (
          <img
            src={brand.logo}
            alt={brand.name}
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = 'none' }}
          />
        ) : (
          <span className="font-display text-xl font-extrabold text-ink-faint">
            {brand.name?.[0]?.toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-semibold text-ink truncate group-hover:text-accent transition-colors">{brand.name}</p>
        {brand.description && (
          <p className="text-xs text-ink-faint line-clamp-1 mt-0.5">{brand.description}</p>
        )}
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-xs text-ink-soft">{brand.product_count} товаров</span>
          {hasRating ? (
            <span className="flex items-center gap-1 text-xs font-semibold text-ink">
              <svg className="w-3.5 h-3.5 text-star" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {brand.rating}
            </span>
          ) : (
            <span className="text-xs text-ink-faint">Нет оценок</span>
          )}
        </div>
      </div>
    </Card>
  )
}
