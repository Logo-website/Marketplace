import { Link } from 'react-router-dom'
import { Swiper, SwiperSlide } from 'swiper/react'
import { Autoplay, Pagination } from 'swiper/modules'
import 'swiper/css'
import 'swiper/css/pagination'
import { HOME_BANNERS } from '../../data/homeBanners'

// Hero-карусель главной (узел 1.2) на Swiper (уже в стеке). Один баннер ->
// без автопрокрутки и точек (не показываем «карусель из одного слайда»,
// граничный случай плана 5). Клик по баннеру -> навигация на каталог.

function Banner({ banner }) {
  return (
    <Link
      to={banner.to}
      className={`block bg-gradient-to-br ${banner.gradient} rounded-2xl p-8 md:p-10 relative overflow-hidden h-56 md:h-64`}
    >
      <div className="relative z-10 max-w-lg">
        <span className="text-xs font-bold text-blue-300 uppercase tracking-widest">
          {banner.eyebrow}
        </span>
        <h2 className="text-2xl md:text-3xl font-black text-white mt-2 mb-2">
          {banner.title}
        </h2>
        <p className="text-gray-300 text-sm mb-5">{banner.subtitle}</p>
        <span className="inline-block px-5 py-2.5 bg-white text-[#111] rounded-xl font-bold text-sm">
          {banner.cta} →
        </span>
      </div>
      <div className="absolute -right-6 -bottom-6 text-9xl opacity-10 select-none">
        {banner.emoji}
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
          <SwiperSlide key={banner.id}>
            <Banner banner={banner} />
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  )
}
