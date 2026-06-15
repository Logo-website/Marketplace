import { Link, useNavigate } from 'react-router-dom'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import useAuthStore from '../store/authStore'
import useCartStore from '../store/cartStore'
import useWishlistStore from '../store/wishlistStore'
import api from '../api'

export default function Header() {
  const { user, isAuthenticated, logout } = useAuthStore()
  const { items } = useCartStore()
  const { items: wishlistItems } = useWishlistStore()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const searchRef = useRef(null)
  const suggestTimeout = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const fetchSuggestions = (query) => {
    clearTimeout(suggestTimeout.current)
    if (query.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }
    suggestTimeout.current = setTimeout(async () => {
      try {
        const res = await api.get(`/products/autocomplete/?q=${encodeURIComponent(query)}`)
        setSuggestions(Array.isArray(res.data) ? res.data : [])
        setShowSuggestions(true)
      } catch {
        setSuggestions([])
      }
    }, 300)
  }

  const handleSearch = (e) => {
    e.preventDefault()
    if (search.trim()) {
      setShowSuggestions(false)
      navigate(`/search?q=${search}`)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)

  return (
    <>
      <motion.header
        className="fixed top-0 left-0 right-0 z-50 bg-[#111]"
        initial={{ y: -80 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">

            {/* Логотип */}
            <Link to="/" className="flex items-center gap-2.5 shrink-0">
              <motion.div
                className="w-9 h-9 bg-white rounded-xl flex items-center justify-center"
                whileHover={{ scale: 1.05, rotate: 5 }}
                whileTap={{ scale: 0.95 }}
              >
                <span className="text-[#111] font-black text-base">M</span>
              </motion.div>
              <span className="text-white font-bold text-xl tracking-tight hidden sm:block">
                Market<span className="text-gray-500 font-normal">place</span>
              </span>
            </Link>

            {/* Поиск */}
            <form onSubmit={handleSearch} className="flex-1 max-w-2xl relative" ref={searchRef}>
              <div className="relative">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    fetchSuggestions(e.target.value)
                  }}
                  onFocus={() => search.length >= 2 && setShowSuggestions(true)}
                  placeholder="Поиск товаров, брендов..."
                  className="w-full bg-white/10 text-white placeholder-gray-500 rounded-xl pl-4 pr-12 py-3 text-sm border border-white/10 focus:outline-none focus:border-white/30 focus:bg-white/15 transition-all"
                />
                <button
                  type="submit"
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition"
                >
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>

              {/* Подсказки */}
              <AnimatePresence>
                {showSuggestions && suggestions.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden z-50"
                  >
                    {suggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSearch(item.name)
                          setShowSuggestions(false)
                          navigate(`/products/${item.id}`)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition text-left border-b border-gray-50 last:border-0"
                      >
                        <div className="w-10 h-10 bg-gray-100 rounded-lg overflow-hidden shrink-0 flex items-center justify-center">
                          {item.image_url ? (
                            <img
                              src={item.image_url}
                              alt=""
                              className="w-full h-full object-contain"
                              onError={(e) => { e.target.style.display = 'none' }}
                            />
                          ) : (
                            <span className="text-lg">📦</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 line-clamp-1">{item.name}</p>
                          <p className="text-xs text-gray-400">{item.category_name}</p>
                        </div>
                        <span className="text-sm font-bold text-emerald-600 shrink-0">
                          {Number(item.price).toLocaleString()} ₽
                        </span>
                      </button>
                    ))}
                    <button
                      type="submit"
                      className="w-full px-4 py-3 text-sm text-indigo-600 font-semibold hover:bg-indigo-50 transition text-center"
                    >
                      Показать все результаты по "{search}" →
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </form>

            {/* Правая часть */}
            <div className="flex items-center gap-2 shrink-0">

              {/* Избранное */}
              <Link to="/wishlist">
                <motion.div
                  className="relative flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 transition"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                  <span className="text-white text-sm font-medium hidden md:block">Избранное</span>
                  <AnimatePresence>
                    {wishlistItems.length > 0 && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs font-black rounded-full w-5 h-5 flex items-center justify-center"
                      >
                        {wishlistItems.length}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              </Link>

              {/* Корзина */}
              <Link to="/cart">
                <motion.div
                  className="relative flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 transition"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
                  </svg>
                  <span className="text-white text-sm font-medium hidden md:block">Корзина</span>
                  <AnimatePresence>
                    {totalItems > 0 && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        className="absolute -top-1.5 -right-1.5 bg-white text-[#111] text-xs font-black rounded-full w-5 h-5 flex items-center justify-center"
                      >
                        {totalItems}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </motion.div>
              </Link>

              {isAuthenticated ? (
                <>
                  {user?.role === 'seller' && (
                    <Link to="/seller">
                      <motion.div
                        className="hidden md:flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 transition text-sm text-white font-medium"
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        Продавцу
                      </motion.div>
                    </Link>
                  )}
                  <Link to="/profile">
                    <motion.div
                      className="flex items-center gap-2 px-4 py-3 rounded-xl bg-white/10 hover:bg-white/15 transition"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <div className="w-6 h-6 rounded-full bg-white/20 flex items-center justify-center text-xs font-black text-white">
                        {user?.username?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <span className="text-white text-sm font-medium hidden md:block">{user?.username}</span>
                    </motion.div>
                  </Link>
                  <motion.button
                    onClick={handleLogout}
                    className="px-4 py-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition text-sm font-medium"
                    whileTap={{ scale: 0.97 }}
                  >
                    Выйти
                  </motion.button>
                </>
              ) : (
                <>
                  <Link to="/login">
                    <motion.div
                      className="px-5 py-3 rounded-xl text-white text-sm font-semibold hover:bg-white/10 transition border border-white/20"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Войти
                    </motion.div>
                  </Link>
                  <Link to="/register">
                    <motion.div
                      className="px-5 py-3 rounded-xl bg-white text-[#111] text-sm font-bold hover:bg-gray-100 transition"
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      Регистрация
                    </motion.div>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.header>
      <div className="h-[73px]" />
    </>
  )
}