// Выбор размера и цвета (Ф4) - data-driven от product.attributes.
// Рендерится ТОЛЬКО при наличии данных: нет attributes.sizes -> нет селектора
// размеров; нет attributes.colors -> нет палитры (правило репо №1, не показываем
// пустой/выдуманный контрол). Наполнение данными - форма продавца Ф12.
//
// Контракт attributes (план Ф4, решение 1):
//   sizes:  [{ label: 'M', available: true }]   available - флаг ПОКАЗА (кнопка
//           неактивна), НЕ реальный per-size stock (тот в Ф8/Ф12).
//   colors: [{ label: 'Чёрный', code: '#000', product_id: <id|null> }]
//           product_id - forward-связь вариантов (Ф12); пока null - не навигирует.
export default function VariantPicker({
  sizes,
  colors,
  selectedSize,
  onSelectSize,
  selectedColor,
  onSelectColor,
  onSizeGuide,
}) {
  const hasSizes = Array.isArray(sizes) && sizes.length > 0
  const hasColors = Array.isArray(colors) && colors.length > 0
  if (!hasSizes && !hasColors) return null

  return (
    <div className="flex flex-col gap-4">
      {hasColors && (
        <div>
          <span className="text-sm text-gray-500 font-medium block mb-2">
            Цвет{selectedColor ? `: ${selectedColor.label}` : ''}
          </span>
          <div className="flex flex-wrap gap-2">
            {colors.map((color) => {
              const active = selectedColor?.label === color.label
              return (
                <button
                  key={color.label}
                  onClick={() => onSelectColor?.(color)}
                  title={color.label}
                  aria-label={color.label}
                  aria-pressed={active}
                  className={`w-9 h-9 rounded-full border-2 transition-all ${
                    active ? 'border-indigo-500 scale-110' : 'border-gray-200 hover:border-gray-300'
                  }`}
                  style={{ backgroundColor: color.code || '#e5e7eb' }}
                />
              )
            })}
          </div>
        </div>
      )}

      {hasSizes && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-500 font-medium">
              Размер{selectedSize ? `: ${selectedSize}` : ''}
            </span>
            {onSizeGuide && (
              <button
                onClick={onSizeGuide}
                className="text-xs text-indigo-600 font-semibold hover:underline"
              >
                Таблица размеров
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {sizes.map((size) => {
              // available !== false: отсутствие флага считаем доступным (контракт).
              const available = size.available !== false
              const active = selectedSize === size.label
              return (
                <button
                  key={size.label}
                  onClick={() => available && onSelectSize?.(size.label)}
                  disabled={!available}
                  className={`min-w-[3rem] h-11 px-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    active
                      ? 'border-[#111] bg-[#111] text-white'
                      : available
                        ? 'border-gray-200 text-gray-700 hover:border-gray-400'
                        : 'border-gray-100 text-gray-300 line-through cursor-not-allowed'
                  }`}
                >
                  {size.label}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
