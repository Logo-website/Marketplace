import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MOTION } from './lib/motion'
import Header from './components/Header'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import CatalogPage from './pages/CatalogPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProductPage from './pages/ProductPage'
import BrandPage from './pages/BrandPage'
import BrandsPage from './pages/BrandsPage'
import LooksPage from './pages/LooksPage'
import LookPage from './pages/LookPage'
import SearchPage from './pages/SearchPage'
import CartPage from './pages/CartPage'
import ProfilePage from './pages/ProfilePage'
import SellerPage from './pages/SellerPage'
import SellerOnboardingPage from './pages/SellerOnboardingPage'
import SellerSettingsPage from './pages/SellerSettingsPage'
import useAuthStore from './store/authStore'
import useCartStore from './store/cartStore'
import useNotificationStore from './store/notificationStore'
import NotificationToasts from './components/NotificationToasts'
import ToastContainer from './components/ToastContainer'
import ErrorBoundary from './components/states/ErrorBoundary'
import WishlistPage from './pages/WishlistPage'
import CheckoutPage from './pages/CheckoutPage'
import ChatsPage from './pages/ChatsPage'
import HelpPage from './pages/HelpPage'
import LegalPage from './pages/LegalPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import NotFoundPage from './pages/NotFoundPage'
import AdminRoute from './components/admin/AdminRoute'
import ModerationPage from './pages/admin/ModerationPage'
import ReportsPage from './pages/admin/ReportsPage'


function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuthStore()
  const location = useLocation()
  // Гостя ведём на логин, запоминая, куда он шёл (Ф9 этап 7): «вход просим только
  // на оформлении» - после входа возвращаем в /checkout, а не на главную.
  if (isAuthenticated) return children
  const next = encodeURIComponent(location.pathname + location.search)
  return <Navigate to={`/login?next=${next}`} replace />
}

function SellerRoute({ children }) {
  const { isAuthenticated, user } = useAuthStore()
  const location = useLocation()
  // Гость - на логин с возвратом. Залогиненный не-продавец - в онбординг /sell
  // (а не пустой кабинет): дефект «кабинет открыт любому» чинит Ф11.
  if (!isAuthenticated) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  // Профиль ещё грузится (user null до fetchProfile) - не редиректим раньше времени.
  if (!user) return <div className="max-w-6xl mx-auto px-4 py-20"><div className="bg-card rounded-2xl h-64 skeleton" /></div>
  if (user.role !== 'seller') return <Navigate to="/sell" replace />
  return children
}

function PageWrapper({ children }) {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={MOTION}
      >
        {/* resetKey по маршруту - после краша переход по ссылке сбрасывает boundary */}
        <ErrorBoundary resetKey={location.pathname}>
          {children}
        </ErrorBoundary>
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  const { fetchProfile, isAuthenticated } = useAuthStore()
  const { fetchCart } = useCartStore()
  const { connect, disconnect, fetchUnread } = useNotificationStore()

  useEffect(() => {
    // Корзину грузим всегда: гостю - из localStorage (счётчик в шапке), Ф8.
    fetchCart()
    if (isAuthenticated) {
      fetchProfile()
      connect()
      // Счётчик колокольчика - сразу при входе (не ждём WS, он может быть недоступен).
      fetchUnread()
    }
    // Закрываем WS при размонтировании/смене статуса - реальный logout
    // дополнительно зовёт disconnect из authStore.
    return () => disconnect()
    // Действия сторов (connect/disconnect/fetch*) стабильны - в deps не нужны;
    // эффект завязан только на смену статуса авторизации.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated])

  return (
    <BrowserRouter>
      {/* flex-col + flex-1 на контенте - футер (сосед PageWrapper) прижимается
          к низу на коротких страницах (план Ф7, решение 3.2.7). */}
      <div className="min-h-screen bg-surface flex flex-col">
        <Header />
        <NotificationToasts />
        <ToastContainer />
        <main className="flex-1">
          <PageWrapper>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/catalog/:categoryId" element={<CatalogPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/products/:id" element={<ProductPage />} />
              {/* Каталог брендов (Ф21) - публичный индекс марок, открыт гостю. */}
              <Route path="/brands" element={<BrandsPage />} />
              {/* Лукбук (Ф22) - лента образов и карточка образа, публичные. */}
              <Route path="/looks" element={<LooksPage />} />
              <Route path="/looks/:id" element={<LookPage />} />
              {/* Витрина бренда (Ф20) - публичная, открыта гостю и покупателю. */}
              <Route path="/brand/:id" element={<BrandPage />} />
              <Route path="/search" element={<SearchPage />} />
              {/* Корзина доступна гостю (Ф8): вход просим только на оформлении. */}
              <Route path="/cart" element={<CartPage />} />
              <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
              {/* /sell - онбординг для залогиненного (любая роль); страница сама
                  редиректит уже-продавца в настройки. */}
              <Route path="/sell" element={<PrivateRoute><SellerOnboardingPage /></PrivateRoute>} />
              <Route path="/seller" element={<SellerRoute><SellerPage /></SellerRoute>} />
              <Route path="/seller/settings" element={<SellerRoute><SellerSettingsPage /></SellerRoute>} />
              <Route path="/wishlist" element={<PrivateRoute><WishlistPage /></PrivateRoute>} />
              <Route path="/checkout" element={<PrivateRoute><CheckoutPage /></PrivateRoute>} />
              {/* Чат (Ф24): список диалогов и окно переписки, только для залогиненных. */}
              <Route path="/chats" element={<PrivateRoute><ChatsPage /></PrivateRoute>} />
              <Route path="/chats/:id" element={<PrivateRoute><ChatsPage /></PrivateRoute>} />
              {/* Помощь / FAQ (Ф24) - публичный раздел. */}
              <Route path="/help" element={<HelpPage />} />
              {/* Юр-документы (Ф26) - одна страница на все 5 документов по slug,
                  публичные (открыты гостю). */}
              <Route path="/legal/:slug" element={<LegalPage />} />
              {/* Админ-зона (Ф17): очередь модерации товаров под роль-гейт admin. */}
              <Route path="/admin/moderation" element={<AdminRoute><ModerationPage /></AdminRoute>} />
              {/* Админ-зона (Ф18): очередь жалоб и модерация UGC под роль-гейт admin. */}
              <Route path="/admin/reports" element={<AdminRoute><ReportsPage /></AdminRoute>} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </PageWrapper>
        </main>
        <Footer />
      </div>
    </BrowserRouter>
  )
}

