import { Navigate, useLocation } from 'react-router-dom'
import useAuthStore from '../../store/authStore'

// Роль-гейт администратора (Ф17, первая админ-фаза с UI). По образцу SellerRoute:
// гость -> логин с возвратом; залогиненный не-админ -> на главную (админка не
// для него, таблица ролей 4.1). Профиль грузится (user=null) - ждём, не редиректим
// раньше времени. Это минимальная база; админ-оболочку/дашборд достроит Ф34.
export default function AdminRoute({ children }) {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()
  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (!user) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-20">
        <div className="bg-white rounded-2xl h-64 skeleton" />
      </div>
    )
  }
  if (user.role !== 'admin') return <Navigate to="/" replace />
  return children
}
