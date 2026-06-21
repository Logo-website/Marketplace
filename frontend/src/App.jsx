import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Header from './components/Header'
import Footer from './components/Footer'
import HomePage from './pages/HomePage'
import CatalogPage from './pages/CatalogPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProductPage from './pages/ProductPage'
import SearchPage from './pages/SearchPage'
import CartPage from './pages/CartPage'
import ProfilePage from './pages/ProfilePage'
import SellerPage from './pages/SellerPage'
import useAuthStore from './store/authStore'
import useCartStore from './store/cartStore'
import useNotificationStore from './store/notificationStore'
import NotificationToasts from './components/NotificationToasts'
import ToastContainer from './components/ToastContainer'
import ErrorBoundary from './components/states/ErrorBoundary'
import WishlistPage from './pages/WishlistPage'
import CheckoutPage from './pages/CheckoutPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import NotFoundPage from './pages/NotFoundPage'


function PrivateRoute({ children }) {
  const { isAuthenticated } = useAuthStore()
  return isAuthenticated ? children : <Navigate to="/login" />
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
        transition={{ duration: 0.2 }}
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
  const { connect, disconnect } = useNotificationStore()

  useEffect(() => {
    // Корзину грузим всегда: гостю - из localStorage (счётчик в шапке), Ф8.
    fetchCart()
    if (isAuthenticated) {
      fetchProfile()
      connect()
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
      <div className="min-h-screen bg-[#f5f5f5] flex flex-col">
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
              <Route path="/search" element={<SearchPage />} />
              {/* Корзина доступна гостю (Ф8): вход просим только на оформлении. */}
              <Route path="/cart" element={<CartPage />} />
              <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
              <Route path="/seller" element={<PrivateRoute><SellerPage /></PrivateRoute>} />
              <Route path="/wishlist" element={<PrivateRoute><WishlistPage /></PrivateRoute>} />
              <Route path="/checkout" element={<PrivateRoute><CheckoutPage /></PrivateRoute>} />
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

