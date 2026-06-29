import { Link } from 'react-router-dom'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'
import { HOME_BANNERS } from '../../data/homeBanners'

// Hero-карусель главной (узел 1.2) на Swiper (уже в стеке). Один баннер ->
// без автопрокрутки и точек (не показываем «карусель из одного слайда»,
// граничный случай плана 5). Клик по баннеру -> навигация на каталог.

// Слайд - галерейный баннер (бренд-гайд: светлый фон, мягкий зелёный акцент,
// градиент допустим только в hero §5 п.5). Заголовок - Bricolage, действие -
// чернильная кнопка, уходящая в акцент на hover. Вместо emoji-водяного знака -
// мягкие акцентные круги (бренд-гайд §5 п.4: иконки/формы, а не emoji).
function Banner({ banner }) {
  return (
    <Link
      to={banner.to}
      className="group relative block overflow-hidden rounded-3xl border border-line bg-linear-to-br from-accent-soft via-surface to-canvas px-8 py-10 md:px-14 md:py-16 h-full min-h-60 md:min-h-72"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -bottom-24 h-72 w-72 rounded-full border border-accent/10 bg-accent/4"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-2 -top-16 h-48 w-48 rounded-full bg-accent/3"
      />
      <div className="relative z-10 max-w-lg">
        <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-accent">
          {banner.eyebrow}
        </span>
        <h2 className="mt-3 mb-3 font-display text-3xl md:text-5xl font-extrabold tracking-tight text-ink">
          {banner.title}
        </h2>
        <p className="mb-6 max-w-md text-sm md:text-base text-ink-soft">{banner.subtitle}</p>
        <span className="inline-flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-semibold text-white transition-colors group-hover:bg-accent">
          {banner.cta}
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14m-6-6l6 6-6 6" />
          </svg>
        </span>
      </div>
    </Link>
  )
}

export default function HeroCarousel() {
  const banners = HOME_BANNERS

  if (banners.length === 0) return null

  // Один баннер - статика, без модулей карусели.
  if (banners.length === 1) {
    return (
      <div className="mb-8">
        <Banner banner={banners[0]} />
      </div>
    )
  }

  return (
    <div className="mb-8 hero-carousel">
      <Swiper
        modules={[Autoplay, Pagination]}
        slidesPerView={1}
        loop
        autoplay={{ delay: 5000, disableOnInteraction: false }}
        pagination={{ clickable: true }}
      >
        {banners.map((banner) => (
          <SwiperSlide key={banner.id} className="h-auto">
            <Banner banner={banner} />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  )
}
