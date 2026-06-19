// Презентационные скелетоны загрузки. Используют CSS-класс `.skeleton`
// (shimmer) из index.css - здесь только разметка, без логики и API.

// Базовый блок-заглушка. Размеры/форму задаёт вызывающий через className.
export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />
}

// Скелетон одной карточки товара - повторяет вёрстку ProductCard 1:1,
// чтобы при загрузке не было «прыжка» при подмене на реальные карточки.
export function CardSkeleton() {
  return (
    <div className="bg-white rounded-2xl overflow-hidden">
      <div className="skeleton h-48 w-full" />
      <div className="p-4 flex flex-col gap-2">
        <div className="skeleton h-3 rounded-full w-1/3" />
        <div className="skeleton h-4 rounded-full w-full" />
        <div className="skeleton h-6 rounded-full w-1/2 mt-2" />
      </div>
    </div>
  )
}

// Сетка скелетонов карточек. count - сколько заглушек, className - классы
// самой сетки (у главной и поиска разное число колонок, поэтому настраиваемо).
const DEFAULT_GRID = 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4'

export function ProductGridSkeleton({ count = 10, className = DEFAULT_GRID }) {
  return (
    <div className={className}>
      {[...Array(count)].map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  )
}
