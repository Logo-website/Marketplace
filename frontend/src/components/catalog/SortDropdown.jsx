import { motion } from 'framer-motion'

// Опции сортировки выдачи. Совпадают с бэкендом ProductListView (popular/new/
// rating/price_asc/price_desc). Локальные: когда Ф3/Ф7 тоже мигрируют на этот
// селектор, вынести в общий constants-модуль (иначе react-refresh ругается на
// экспорт не-компонента из файла компонента).
const SORT_OPTIONS = [
  { id: 'popular',    label: 'Популярные'  },
  { id: 'new',        label: 'Новинки'     },
  { id: 'rating',     label: 'По рейтингу' },
  { id: 'price_asc',  label: 'Дешевле'     },
  { id: 'price_desc', label: 'Дороже'      },
]

// Line-иконки по id опции (бренд-гайд §4: иконки, не emoji). Ключ - id, поэтому
// одна карта обслуживает и каталог, и поиск (relevance) без дублирования в данных.
const cls = 'w-3.5 h-3.5'
const SORT_ICONS = {
  popular: (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l6-6 4 4 8-8M21 7v5m0-5h-5" />
    </svg>
  ),
  relevance: (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M11 18a7 7 0 100-14 7 7 0 000 14zm0-4a3 3 0 100-6 3 3 0 000 6z" />
    </svg>
  ),
  new: (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3zM18 14l.7 1.8L20.5 16.5 18.7 17.2 18 19l-.7-1.8L15.5 16.5l1.8-.7L18 14z" />
    </svg>
  ),
  rating: (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.5l2.2 4.46 4.92.72-3.56 3.47.84 4.9-4.4-2.31-4.4 2.31.84-4.9L4.36 8.68l4.92-.72 2.2-4.46z" />
    </svg>
  ),
  price_asc: (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m0 0l-6-6m6 6l6-6" />
    </svg>
  ),
  price_desc: (
    <svg className={cls} fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-6 6m6-6l6 6" />
    </svg>
  ),
}

// Презентационный селектор сортировки. value - id текущей сортировки (из URL),
// onChange(id) - выбор нового. На узком экране прячет подписи, оставляя иконки.
// options - набор опций пропом (по умолчанию каталожный): поиск (Ф3) передаёт
// свой набор с «по релевантности» вместо «популярное», не дублируя компонент.
export default function SortDropdown({ value, onChange, options = SORT_OPTIONS }) {
  return (
    <div className="flex items-center bg-card border border-line rounded-2xl p-1 gap-1">
      {options.map((option) => (
        <motion.button
          key={option.id}
          onClick={() => onChange(option.id)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
            value === option.id
              ? 'bg-ink text-white shadow-card'
              : 'text-ink-soft hover:text-ink hover:bg-surface'
          }`}
          whileTap={{ scale: 0.97 }}
        >
          <span>{SORT_ICONS[option.id]}</span>
          <span className="hidden sm:block">{option.label}</span>
        </motion.button>
      ))}
    </div>
  )
}
