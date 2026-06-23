import { Link } from 'react-router-dom'

// Сквозной футер (узел 1.2) - на всех страницах, сосед PageWrapper в App.jsx
// (не внутри, иначе ре-анимировался бы при каждой навигации, план Ф7 решение
// 3.2.7). Часть целей футера - поздние фазы (юр-страницы Ф26, помощь Ф24,
// онбординг продавца Ф11, возвраты Ф23). До своих фаз эти пункты - честная
// заглушка «Скоро» (не битая ссылка), готовые ведут на реальный маршрут.

// Пункт: есть `to` - кликабельная ссылка; нет - приглушённый «Скоро».
function FooterItem({ label, to }) {
  if (to) {
    return (
      <li>
        <Link to={to} className="text-gray-400 hover:text-white transition text-sm">
          {label}
        </Link>
      </li>
    )
  }
  return (
    <li className="flex items-center gap-2">
      <span className="text-gray-500 text-sm cursor-default">{label}</span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-gray-600 border border-gray-700 rounded px-1 py-0.5">
        Скоро
      </span>
    </li>
  )
}

const COLUMNS = [
  {
    title: 'О компании',
    items: [
      { label: 'О нас', to: '/legal/about' },
      { label: 'Вакансии' },
      { label: 'Контакты', to: '/legal/contacts' },
    ],
  },
  {
    title: 'Покупателям',
    items: [
      { label: 'Каталог', to: '/catalog' },
      { label: 'Избранное', to: '/wishlist' },
      { label: 'Помощь и FAQ' },
      { label: 'Доставка и возврат', to: '/legal/delivery-returns' },
    ],
  },
  {
    title: 'Продавцам',
    items: [
      { label: 'Продавать на площадке', to: '/seller' },
      { label: 'Тарифы и комиссии' },
    ],
  },
  {
    // Документы (Ф26): ссылки ведут на страницы /legal/<slug>.
    title: 'Документы',
    items: [
      { label: 'Публичная оферта', to: '/legal/oferta' },
      { label: 'Политика конфиденциальности', to: '/legal/privacy' },
      { label: 'Правила возврата', to: '/legal/delivery-returns' },
    ],
  },
]

const SOCIALS = ['VK', 'TG', 'IG', 'YT']

export default function Footer() {
  return (
    <footer className="bg-[#111] text-white mt-12">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Бренд */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-white rounded-xl flex items-center justify-center">
                <span className="text-[#111] font-black text-base">M</span>
              </div>
              <span className="font-bold text-xl tracking-tight">
                Market<span className="text-gray-500 font-normal">place</span>
              </span>
            </Link>
            <p className="text-gray-500 text-sm mt-4 max-w-xs">
              Маркетплейс одежды: локальные бренды и частные продавцы в одном месте.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="font-bold text-sm mb-4">{col.title}</h3>
              <ul className="flex flex-col gap-2.5">
                {col.items.map((item) => (
                  <FooterItem key={item.label} label={item.label} to={item.to} />
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Низ: соцсети (заглушки до своих ссылок) + копирайт */}
        <div className="border-t border-gray-800 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-gray-500 text-sm">
            © {new Date().getFullYear()} Marketplace. Все права защищены.
          </p>
          <div className="flex items-center gap-2">
            {SOCIALS.map((s) => (
              <span
                key={s}
                title="Скоро"
                className="w-9 h-9 rounded-xl bg-white/5 flex items-center justify-center text-xs font-bold text-gray-500 cursor-default select-none"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
