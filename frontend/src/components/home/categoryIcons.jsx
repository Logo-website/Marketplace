// Курируемый набор line-иконок категорий для плиток главной (узел 1.2).
// Зачем свой набор, а не готовая библиотека: у lucide/heroicons нет fashion-
// глифов (джинсы, платье, купальник, носки, комбинезон) - 15 из 20 категорий
// получили бы одинаковую «рубашку». Рисуем сами, группируя по смыслу.
//
// Источник истины по категориям - сид (~20 имён). Маппинг идёт по ТОЧНОМУ
// имени; неизвестная категория (в т.ч. заведённая админом в Ф19) падает на
// «вешалку» - плитка не ломается и не остаётся пустой.

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

// Каждая иконка - чистый набор <path> в общем viewBox 24x24.
const ICONS = {
  // Платье: бретели + расклёшенная юбка.
  dress: <path {...STROKE} d="M9 3l1 3M15 3l-1 3M10 6h4l3 14q-5 2-10 0z" />,
  // Брюки/джинсы: пояс + две штанины.
  trousers: (
    <path {...STROKE} d="M7 3h10v3l-1.5 15h-3L12 9l-.5 12h-3L7 6z" />
  ),
  // Футболка: горловина + рукава + корпус.
  tshirt: (
    <path
      {...STROKE}
      d="M8 4 4 7l2 3 2-1v11h8V9l2 1 2-3-4-3q-4 3-8 0z"
    />
  ),
  // Толстовка/куртка: тот же корпус + молния по центру + ворот-капюшон.
  jacket: (
    <>
      <path {...STROKE} d="M8 4 4 7l2 3 2-1v11h8V9l2 1 2-3-4-3-4 2z" />
      <path {...STROKE} d="M8 4l4 2 4-2" />
      <path {...STROKE} d="M12 6v14" />
    </>
  ),
  // Костюм: пиджак с лацканами и пуговицей.
  suit: (
    <>
      <path {...STROKE} d="M8 4 4 7l2 3 2-1v11h8V9l2 1 2-3-4-3-4 2z" />
      <path {...STROKE} d="M9 6l3 6 3-6" />
      <circle cx="12" cy="15" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  // Купальник: топ-чашки + низ.
  swim: (
    <>
      <path {...STROKE} d="M5 7q7 3 14 0l-2 4q-5 2-10 0z" />
      <path {...STROKE} d="M9 15q3 2 6 0l-2 4h-2z" />
    </>
  ),
  // Обувь/кроссовок: профиль кеда + шнуровка.
  shoe: (
    <>
      <path
        {...STROKE}
        d="M3 14h3l3-3 2 2h7q2 0 2 3v2H3z"
      />
      <path {...STROKE} d="M9 11l1.5 1.5M11 12l1.5 1.5" />
    </>
  ),
  // Носок: L-образный силуэт с манжетой.
  socks: (
    <path
      {...STROKE}
      d="M10 3h4v9l4 4q1.5 2-1 3l-2 1q-2 .8-3-1l-3-5V3z"
    />
  ),
  // Сумка: корпус + ручка.
  bag: (
    <>
      <path {...STROKE} d="M5 9h14l-1 11H6z" />
      <path {...STROKE} d="M8 9V7q0-3 4-3t4 3v2" />
    </>
  ),
  // Аксессуары: наручные часы.
  accessory: (
    <>
      <rect {...STROKE} x="8.5" y="7" width="7" height="10" rx="1.5" />
      <path {...STROKE} d="M10 7V4h4v3M10 17v3h4v-3" />
    </>
  ),
  // Нижнее бельё: трусы.
  underwear: (
    <path {...STROKE} d="M5 7h14l-2 5q-5 1-5 6-0-5-5-6z" />
  ),
  // Вешалка - запасной значок для всего прочего.
  hanger: (
    <>
      <path {...STROKE} d="M12 4q-2 0-2 2t2 2v1.5" />
      <path {...STROKE} d="M12 9.5 4 15q-1 1-1 2h18q0-1-1-2z" />
    </>
  ),
}

// Точное имя сид-категории -> ключ иконки. Близкие категории делят значок.
const NAME_TO_ICON = {
  Платья: 'dress',
  Комбинезоны: 'dress',
  Джинсы: 'trousers',
  Брюки: 'trousers',
  Шорты: 'trousers',
  'Футболки и блузки': 'tshirt',
  Рубашки: 'tshirt',
  'Домашняя одежда': 'tshirt',
  'Спортивная одежда': 'tshirt',
  Толстовки: 'jacket',
  'Куртки и пальто': 'jacket',
  Костюмы: 'suit',
  Купальники: 'swim',
  Кроссовки: 'shoe',
  Обувь: 'shoe',
  Носки: 'socks',
  Сумки: 'bag',
  Аксессуары: 'accessory',
  'Нижнее бельё': 'underwear',
  Другое: 'hanger',
}

// React-узел иконки по имени категории. Неизвестное имя -> вешалка.
export default function CategoryIcon({ name, className = '' }) {
  const node = ICONS[NAME_TO_ICON[name] ?? 'hanger']
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden="true"
      role="presentation"
    >
      {node}
    </svg>
  )
}
