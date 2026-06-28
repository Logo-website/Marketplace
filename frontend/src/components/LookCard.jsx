import { Link } from 'react-router-dom'
import Card from './ui/Card'

// Запасной квадрат, когда у образа нет обложки. Line-иконка (бренд-гайд §4),
// та же «нет фото», что у ProductCard - единый язык каталога.
const CoverPlaceholder = (
  <div className="h-full flex items-center justify-center text-line-strong">
    <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  </div>
)

// Карточка образа в ленте (Ф22, узел 1.23) - комплект целиком: фото образа,
// название, источник (редакция / имя бренда), число вещей и сумма комплекта.
// Презентационная: данные приходят пропом, ведёт на карточку образа /looks/:id.
// Gallery Minimal (Ф8): примитив Card + подъём на hover, цена - Bricolage/ink,
// цвета только токены.
export default function LookCard({ look }) {
  const cover = look.cover
  const price = Number(look.total_price)

  return (
    <Card as={Link} to={`/looks/${look.id}`} hover className="group h-full flex flex-col overflow-hidden">
      {/* Фото образа целиком (не одной вещи). 3:4 - вертикаль под образ. */}
      <div className="relative bg-surface aspect-[3/4] overflow-hidden shrink-0">
        {cover ? (
          <img
            src={cover}
            alt={look.title}
            className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          CoverPlaceholder
        )}
        {/* Бейдж источника: редакция или бренд */}
        <span className="absolute top-3 left-3 bg-card/90 backdrop-blur text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-lg text-ink-soft">
          {look.source === 'editorial' ? 'Редакция' : look.source_name}
        </span>
      </div>

      {/* Контент */}
      <div className="p-4 flex flex-col flex-1">
        <h3 className="font-bold text-ink text-sm line-clamp-2 leading-snug mb-1 group-hover:text-accent transition-colors">
          {look.title}
        </h3>
        <p className="text-xs text-ink-faint mb-3">
          {look.items_count} {pluralizeItems(look.items_count)}
        </p>
        <div className="mt-auto flex items-center justify-between pt-2">
          {/* Пустой комплект (все вещи распроданы) - честно «нет в продаже». */}
          {look.items_count > 0 ? (
            <span className="font-display text-lg font-bold text-ink">
              {price.toLocaleString()} ₽
            </span>
          ) : (
            <span className="text-sm font-semibold text-ink-faint">Нет в продаже</span>
          )}
          <span className="flex items-center gap-1 text-xs font-semibold text-accent">
            Смотреть образ
            <svg className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </span>
        </div>
      </div>
    </Card>
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
