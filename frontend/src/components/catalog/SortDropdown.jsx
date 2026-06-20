import { motion } from 'framer-motion'

// Опции сортировки выдачи. Совпадают с бэкендом ProductListView (popular/new/
// rating/price_asc/price_desc). Локальные: когда Ф3/Ф7 тоже мигрируют на этот
// селектор, вынести в общий constants-модуль (иначе react-refresh ругается на
// экспорт не-компонента из файла компонента).
const SORT_OPTIONS = [
  { id: 'popular',    label: 'Популярные',   icon: '🔥' },
  { id: 'new',        label: 'Новинки',      icon: '✨' },
  { id: 'rating',     label: 'По рейтингу',  icon: '⭐' },
  { id: 'price_asc',  label: 'Дешевле',      icon: '↓' },
  { id: 'price_desc', label: 'Дороже',       icon: '↑' },
]

// Презентационный селектор сортировки. value - id текущей сортировки (из URL),
// onChange(id) - выбор нового. На узком экране прячет подписи, оставляя иконки.
// options - набор опций пропом (по умолчанию каталожный): поиск (Ф3) передаёт
// свой набор с «по релевантности» вместо «популярное», не дублируя компонент.
export default function SortDropdown({ value, onChange, options = SORT_OPTIONS }) {
  return (
    <div className="flex items-center bg-white border border-gray-100 rounded-2xl p-1 gap-1">
      {options.map((option) => (
        <motion.button
          key={option.id}
          onClick={() => onChange(option.id)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
            value === option.id
              ? 'bg-[#111] text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50'
          }`}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
        >
          <span>{option.icon}</span>
          <span className="hidden sm:block">{option.label}</span>
        </motion.button>
      ))}
    </div>
  )
}
