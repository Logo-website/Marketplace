import ProductRow from './ProductRow'
import useRecentlyViewedStore from '../../store/recentlyViewedStore'

// Лента «вы недавно смотрели» (узел 1.12) поверх общего ProductRow и
// клиентского стора. Если история пуста (новый гость) - ProductRow сам
// ничего не рендерит (status ready + 0 товаров). Компонент переиспользуемый:
// в Ф10 эта же лента живёт в профиле.
export default function RecentlyViewed({ title = 'Вы недавно смотрели' }) {
  const items = useRecentlyViewedStore((s) => s.items)
  return <ProductRow title={title} products={items} status="ready" />
}
