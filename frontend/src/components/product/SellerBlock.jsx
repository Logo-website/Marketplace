import { Link, useNavigate } from 'react-router-dom'
import useAuthStore from '../../store/authStore'
import useChatStore from '../../store/chatStore'

// Блок продавца на карточке (Ф4). Показывает имя магазина (seller_name из API -
// публичное имя, не email, S17). Витрина бренда (Ф20) - ссылка на /brand/:id;
// «Написать» (Ф24) - старт диалога с продавцом с контекстом товара. Гость -> логин
// с возвратом (§5), не 401 в лицо. Без sellerId кнопки продавца не рисуются.
export default function SellerBlock({ sellerName, sellerId, productId }) {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuthStore()

  if (!sellerName) return null

  const writeToSeller = async () => {
    if (!isAuthenticated) {
      // Запоминаем, откуда шёл гость - вернём после логина (PrivateRoute-флоу).
      const next = encodeURIComponent(productId ? `/products/${productId}` : '/chats')
      navigate(`/login?next=${next}`)
      return
    }
    const convId = await useChatStore.getState().startConversation({
      kind: 'seller', seller: sellerId, product: productId,
    })
    if (convId) navigate(`/chats/${convId}`)
  }

  return (
    <div className="bg-surface rounded-xl p-4 border border-line flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-full bg-card border border-line flex items-center justify-center text-sm font-bold text-ink-soft shrink-0">
          {sellerName[0]?.toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-ink-faint">Продаёт</p>
          <p className="text-sm font-semibold text-ink truncate">{sellerName}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {sellerId && (
          <Link
            to={`/brand/${sellerId}`}
            className="text-xs font-semibold text-ink-soft hover:text-ink border border-line hover:border-line-strong rounded-lg px-3 py-1.5 transition"
          >
            Витрина
          </Link>
        )}
        {sellerId && (
          <button
            onClick={writeToSeller}
            className="text-xs font-semibold text-white bg-ink hover:bg-ink/90 rounded-lg px-3 py-1.5 transition"
          >
            Написать
          </button>
        )}
      </div>
    </div>
  )
}
