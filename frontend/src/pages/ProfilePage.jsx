import { useSearchParams } from 'react-router-dom'
import useAuthStore from '../store/authStore'
import ProfileSidebar from '../components/profile/ProfileSidebar'
import OverviewTab from '../components/profile/OverviewTab'
import OrdersTab from '../components/profile/OrdersTab'
import MyDataTab from '../components/profile/MyDataTab'
import AddressesTab from '../components/profile/AddressesTab'
import MyReviewsTab from '../components/profile/MyReviewsTab'
import NotificationsTab from '../components/profile/NotificationsTab'
import ReturnsTab from '../components/profile/ReturnsTab'
import ChatsTab from '../components/profile/ChatsTab'
import ForwardTab from '../components/profile/ForwardTab'

// Оболочка-кабинет (Ф10, узел 1.13). ProfilePage держит только роутинг вкладок
// через ?tab=; каждая вкладка - независимый компонент со своей загрузкой (Ф0),
// упавшая вкладка не валит кабинет. Форвард-узлы - честные заглушки ForwardTab.
const TABS = [
  { id: 'overview', label: 'Обзор', icon: '🏠' },
  { id: 'orders', label: 'Заказы', icon: '📦' },
  { id: 'data', label: 'Мои данные', icon: '👤' },
  { id: 'addresses', label: 'Адреса', icon: '📍' },
  { id: 'reviews', label: 'Мои отзывы', icon: '⭐' },
  { id: 'notifications', label: 'Уведомления', icon: '🔔' },
  { id: 'wishlist', label: 'Избранное', icon: '❤️', link: '/wishlist' },
  { id: 'returns', label: 'Возвраты', icon: '↩️' },
  { id: 'questions', label: 'Мои вопросы', icon: '❓' },
  { id: 'brands', label: 'Бренды', icon: '🏷️' },
  { id: 'points', label: 'Баллы', icon: '🎁' },
  { id: 'chats', label: 'Чаты', icon: '💬' },
]
// Только контент-вкладки (без ссылок вроде «Избранное»): прямой заход
// ?tab=wishlist не должен попасть в контент-роутер и отрисовать пустую заглушку.
const CONTENT_IDS = TABS.filter((t) => !t.link).map((t) => t.id)

// Форвард-заглушки: вкладка видна, ведёт в свою фазу, без битых ссылок.
const FORWARD = {
  questions: { icon: '❓', title: 'Мои вопросы', phase: 'Ф6', description: 'Ваши вопросы о товарах и ответы на них появятся здесь.' },
  brands:    { icon: '🏷️', title: 'Избранные бренды', phase: 'Ф20', description: 'Подписки на бренды и магазины появятся здесь.' },
  points:    { icon: '🎁', title: 'Баллы и бонусы', phase: 'Ф27', description: 'Баллы лояльности, промокоды и акции появятся здесь.' },
}

export default function ProfilePage() {
  const { user } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()

  const raw = searchParams.get('tab')
  // Алиас старой ссылки ?tab=profile -> «Мои данные». Неизвестный таб -> обзор.
  const normalized = raw === 'profile' ? 'data' : raw
  const activeTab = CONTENT_IDS.includes(normalized) ? normalized : 'overview'

  const selectTab = (id) => {
    setSearchParams(id === 'overview' ? {} : { tab: id })
  }

  const renderTab = () => {
    switch (activeTab) {
      case 'overview': return <OverviewTab />
      case 'orders': return <OrdersTab />
      case 'data': return <MyDataTab />
      case 'addresses': return <AddressesTab />
      case 'reviews': return <MyReviewsTab />
      case 'notifications': return <NotificationsTab />
      case 'returns': return <ReturnsTab />
      case 'chats': return <ChatsTab />
      default: return <ForwardTab {...FORWARD[activeTab]} />
    }
  }

  // Кабинет персональный: ждём профиль, иначе вкладки «мои данные»/«уведомления»
  // засеялись бы пустыми из ещё не загруженного user (при заходе по прямой ссылке).
  if (!user) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-[#111] rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <ProfileSidebar user={user} tabs={TABS} active={activeTab} onSelect={selectTab} />
          <div className="flex-1 min-w-0 w-full">
            {renderTab()}
          </div>
        </div>
      </div>
    </div>
  )
}
