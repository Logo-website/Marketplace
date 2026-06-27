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
        <Link to={to} className="text-white/55 hover:text-white transition-colors text-sm">
          {label}
        </Link>
      </li>
    )
  }
  return (
    <li className="flex items-center gap-2">
      <span className="text-white/40 text-sm cursor-default">{label}</span>
      <span className="text-[10px] font-bold uppercase tracking-wide text-accent-soft border border-accent-soft/30 rounded px-1 py-0.5">
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

const SOCIALS = ['VK', 'TG', 'Max']

export default function Footer() {
  return (
    <footer className="bg-ink text-white mt-12">
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          {/* Бренд - вордмарк (бренд-гайд §4): на тёмном фоне знак тот же, текст белый */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-accent rounded-[10px] flex items-center justify-center">
                <span className="text-white font-display font-extrabold text-lg leading-none">М</span>
              </div>
              <span className="font-display font-extrabold text-xl tracking-tight">
                маркет
              </span>
            </Link>
            <p className="text-white/45 text-sm mt-4 max-w-xs leading-relaxed">
              Маркетплейс одежды: локальные бренды и частные продавцы в одном месте.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="font-display font-bold text-sm mb-4">{col.title}</h3>
              <ul className="flex flex-col gap-2.5">
                {col.items.map((item) => (
                  <FooterItem key={item.label} label={item.label} to={item.to} />
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Низ: соцсети (заглушки до своих ссылок) + копирайт */}
        <div className="border-t border-white/10 mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-white/40 text-sm">
            © {new Date().getFullYear()} маркет. Все права защищены.
          </p>
          <div className="flex items-center gap-2">
            {SOCIALS.map((s) => (
              <span
                key={s}
                title="Скоро"
                className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-xs font-bold text-white/45 cursor-default select-none transition-colors"
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
