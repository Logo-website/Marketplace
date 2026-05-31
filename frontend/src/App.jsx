import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Header from './components/Header'
import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ProductPage from './pages/ProductPage'
import SearchPage from './pages/SearchPage'
import CartPage from './pages/CartPage'
import ProfilePage from './pages/ProfilePage'
import SellerPage from './pages/SellerPage'
import useAuthStore from './store/authStore'
import useCartStore from './store/cartStore'
import WishlistPage from './pages/WishlistPage'
import CheckoutPage from './pages/CheckoutPage'

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
        {children}
      </motion.div>
    </AnimatePresence>
  )
}

export default function App() {
  const { fetchProfile, isAuthenticated } = useAuthStore()
  const { fetchCart } = useCartStore()

  useEffect(() => {
    if (isAuthenticated) {
      fetchProfile()
      fetchCart()
    }
  }, [])

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#f5f5f5]">
        <Header />
        <PageWrapper>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/products/:id" element={<ProductPage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/cart" element={<PrivateRoute><CartPage /></PrivateRoute>} />
            <Route path="/profile" element={<PrivateRoute><ProfilePage /></PrivateRoute>} />
            <Route path="/seller" element={<PrivateRoute><SellerPage /></PrivateRoute>} />
            <Route path="/wishlist" element={<PrivateRoute><WishlistPage /></PrivateRoute>} />
            <Route path="/checkout" element={<PrivateRoute><CheckoutPage /></PrivateRoute>} />
          </Routes>
        </PageWrapper>
      </div>
    </BrowserRouter>
  )
}

