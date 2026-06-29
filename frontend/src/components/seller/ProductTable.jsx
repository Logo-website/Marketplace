import { motion } from 'framer-motion'
import { MOTION } from '../../lib/motion'
import StatusBadge from './StatusBadge'

// Реестр товаров продавца (Ф13, узел 2.2): таблица на desktop, карточки-строки
// на mobile (адаптивность, правило 4.2 - таблица на узком экране нечитаема).
// Колонки: фото, название, цена, остаток, статус, действия.
//
// Props:
//   products - массив товаров продавца (с полем status);
//   onEdit(id)              - вход в форму редактирования (Ф12);
//   onToggleVisibility(p)   - скрыть/показать (только active/hidden);
//   onDelete(p)             - запрос на удаление (открывает модалку выше);
//   busyId                  - id товара, по которому идёт запрос видимости.

// Кнопка видимости видна только для прошедших модерацию (active/hidden) -
// для остальных статусов скрыть/показать запрещено бэкендом (план 5.2).
const CAN_TOGGLE = new Set(['active', 'hidden'])

function thumb(product) {
  const img = product.images?.[0]
  return img ? (img.image_url || img.image) : null
}

function formatPrice(p) {
  return `${Number(p).toLocaleString('ru-RU')} ₽`
}

export default function ProductTable({ products, onEdit, onToggleVisibility, onDelete, busyId }) {
  return (
    <>
      {/* Desktop: таблица */}
      <div className="hidden md:block bg-card rounded-2xl border border-line overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-line">
              <th className="text-left px-6 py-4 text-xs font-semibold text-ink-faint uppercase tracking-wide">Товар</th>
              <th className="text-right px-4 py-4 text-xs font-semibold text-ink-faint uppercase tracking-wide">Цена</th>
              <th className="text-right px-4 py-4 text-xs font-semibold text-ink-faint uppercase tracking-wide">Остаток</th>
              <th className="text-left px-4 py-4 text-xs font-semibold text-ink-faint uppercase tracking-wide">Статус</th>
              <th className="text-right px-6 py-4 text-xs font-semibold text-ink-faint uppercase tracking-wide">Действия</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <motion.tr
                key={p.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ ...MOTION, delay: i * 0.03 }}
                className="border-b border-line last:border-0 hover:bg-surface transition"
              >
                <td className="px-6 py-3">
                  <div className="flex items-center gap-3">
                    <Thumb product={p} className="w-11 h-11" />
                    <span className="text-sm font-medium text-ink line-clamp-2 max-w-xs">{p.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-display text-sm text-right font-bold text-ink whitespace-nowrap">{formatPrice(p.price)}</td>
                <td className="px-4 py-3 text-sm text-right text-ink-faint">{p.stock} шт.</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-6 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <RowActions
                      product={p}
                      onEdit={onEdit}
                      onToggleVisibility={onToggleVisibility}
                      onDelete={onDelete}
                      busyId={busyId}
                    />
                  </div>
                </td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile: карточки-строки */}
      <div className="md:hidden flex flex-col gap-3">
        {products.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...MOTION, delay: i * 0.03 }}
            className="bg-card rounded-2xl border border-line p-4"
          >
            <div className="flex items-start gap-3">
              <Thumb product={p} className="w-16 h-16 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-ink line-clamp-2 leading-snug mb-1.5">{p.name}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display text-sm font-bold text-ink">{formatPrice(p.price)}</span>
                  <span className="text-xs text-ink-faint bg-surface px-2 py-0.5 rounded-lg">{p.stock} шт.</span>
                  <StatusBadge status={p.status} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-3">
              <RowActions
                product={p}
                onEdit={onEdit}
                onToggleVisibility={onToggleVisibility}
                onDelete={onDelete}
                busyId={busyId}
                full
              />
            </div>
          </motion.div>
        ))}
      </div>
    </>
  )
}

function Thumb({ product, className = '' }) {
  const src = thumb(product)
  return (
    <div className={`bg-surface rounded-xl flex items-center justify-center overflow-hidden ${className}`}>
      {src ? (
        <img src={src} alt={product.name} className="w-full h-full object-cover" />
      ) : (
        <svg className="w-1/2 h-1/2 text-line-strong" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
        </svg>
      )}
    </div>
  )
}

function RowActions({ product, onEdit, onToggleVisibility, onDelete, busyId, full = false }) {
  const canToggle = CAN_TOGGLE.has(product.status)
  const busy = busyId === product.id
  const btn = (extra) => `${full ? 'flex-1 justify-center' : ''} flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${extra}`
  return (
    <>
      <button
        onClick={() => onEdit(product.id)}
        className={btn('text-ink-soft border-line-strong hover:bg-surface')}
      >
        Изменить
      </button>
      {canToggle && (
        <button
          onClick={() => onToggleVisibility(product)}
          disabled={busy}
          className={btn('text-accent border-accent/30 hover:bg-accent-soft disabled:opacity-50')}
        >
          {product.status === 'active' ? 'Скрыть' : 'Показать'}
        </button>
      )}
      <button
        onClick={() => onDelete(product)}
        className={btn('text-danger border-transparent hover:bg-danger/10 hover:text-danger hover:border-danger/30')}
      >
        Удалить
      </button>
    </>
  )
}
