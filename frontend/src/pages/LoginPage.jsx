import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api'
import useAuthStore from '../store/authStore'

export default function LoginPage() {
  const [step, setStep] = useState(1)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/login/', { email, password })
      setStep(2)
      startCooldown()
    } catch (err) {
      setError(err.response?.data?.error || 'Неверный логин или пароль')
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    if (code.length !== 6) { setError('Введите 6-значный код'); return }
    setLoading(true)
    setError('')
    try {
      const res = await api.post('/auth/login/verify/', { email, code })
      localStorage.setItem('access_token', res.data.access)
      localStorage.setItem('refresh_token', res.data.refresh)
      await useAuthStore.getState().fetchProfile()
      useAuthStore.setState({ isAuthenticated: true })
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Неверный код')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return
    setLoading(true)
    try {
      await api.post('/auth/login/', { email, password })
      startCooldown()
      setError('')
    } catch {
      setError('Ошибка повторной отправки')
    } finally {
      setLoading(false)
    }
  }

  const startCooldown = () => {
    setResendCooldown(60)
    const timer = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0 }
        return prev - 1
      })
    }, 1000)
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

          {/* Лого */}
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2">
              <div className="w-10 h-10 bg-[#111] rounded-xl flex items-center justify-center">
                <span className="text-white font-black text-base">M</span>
              </div>
              <span className="text-[#111] font-bold text-xl">Market<span className="text-gray-400 font-normal">place</span></span>
            </Link>
            <h1 className="text-2xl font-black text-[#111] mt-6">
              {step === 1 ? 'Вход в аккаунт' : 'Подтвердите вход'}
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              {step === 1 ? 'Введите ваши данные' : `Код отправлен на ${email}`}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">

            {error && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl mb-5 text-sm flex items-center gap-2">
                ⚠️ {error}
              </motion.div>
            )}

            <AnimatePresence mode="wait">

              {/* Шаг 1 — email + пароль */}
              {step === 1 && (
                <motion.form
                  key="step1"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  onSubmit={handleSubmit}
                  className="flex flex-col gap-4"
                >
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Логин (Email)</label>
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50 focus:bg-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">Пароль</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'} value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50 focus:bg-white pr-24"
                        required
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-medium">
                        {showPassword ? 'Скрыть' : 'Показать'}
                      </button>
                    </div>
                  </div>

                  <div className="text-right">
                    <Link to="/forgot-password" className="text-xs text-indigo-500 hover:underline font-medium">
                        Забыли пароль?
                    </Link>
                   </div>

                  <motion.button
                    type="submit" disabled={loading}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3.5 rounded-xl font-bold text-sm hover:from-indigo-700 hover:to-purple-700 transition disabled:opacity-50 mt-1 flex items-center justify-center gap-2"
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  >
                    {loading ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : 'Получить код →'}
                  </motion.button>
                </motion.form>
              )}

              {/* Шаг 2 — ввод кода */}
              {step === 2 && (
                <motion.form
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  onSubmit={handleVerify}
                  className="flex flex-col gap-5"
                >
                  <div className="text-center mb-2">
                    <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <svg className="w-7 h-7 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-gray-500 text-sm">Введите 6-значный код из письма</p>
                  </div>

                  <input
                    type="text" value={code}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                      setCode(val)
                      if (error) setError('')
                    }}
                    placeholder="000000"
                    maxLength={6}
                    className="w-full border border-gray-200 rounded-xl px-4 py-4 text-center text-3xl font-black tracking-[0.5em] focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50 focus:bg-white"
                    autoFocus
                  />

                  <motion.button
                    type="submit" disabled={loading || code.length !== 6}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-3.5 rounded-xl font-bold text-sm hover:from-indigo-700 hover:to-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  >
                    {loading ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : 'Войти'}
                  </motion.button>

                  <div className="text-center">
                    <button type="button" onClick={handleResend}
                      disabled={resendCooldown > 0 || loading}
                      className="text-sm text-gray-400 hover:text-indigo-600 transition disabled:cursor-not-allowed">
                      {resendCooldown > 0 ? `Отправить снова через ${resendCooldown}с` : 'Отправить код повторно'}
                    </button>
                  </div>

                  <button type="button" onClick={() => { setStep(1); setCode(''); setError('') }}
                    className="text-sm text-gray-400 hover:text-gray-600 text-center transition">
                    ← Изменить данные
                  </button>
                </motion.form>
              )}

            </AnimatePresence>

            {step === 1 && (
              <>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
                  <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">или</span></div>
                </div>
                <p className="text-center text-gray-500 text-sm">
                  Нет аккаунта?{' '}
                  <Link to="/register" className="text-[#111] font-bold hover:underline">Зарегистрироваться</Link>
                </p>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}