// Карточка-поверхность. Закрывает повторяющийся паттерн «белый фон + скругление
// + светлая граница», который раньше верстался захардкоженной палитрой. Цвета - токены.
//   hover - подъём карточки на наведении (замена tilt/glare, бренд-гайд §3):
//   translateY(-3px) + мягкая тень + усиленная граница.
//   as    - тег/компонент-обёртка (по умолчанию div; напр. Link для кликабельной).
export default function Card({ as: Tag = 'div', hover = false, className = '', children, ...props }) {
  const hoverCls = hover
    ? 'transition-all duration-200 hover:-translate-y-[3px] hover:shadow-lift hover:border-line-strong'
    : ''
  return (
    <Tag className={`bg-card border border-line rounded-2xl ${hoverCls} ${className}`} {...props}>
      {children}
    </Tag>
  )
}
