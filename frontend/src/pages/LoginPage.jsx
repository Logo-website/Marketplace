import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MOTION } from '../lib/motion'
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
  const [searchParams] = useSearchParams()
  // Куда вернуть после входа (Ф9 этап 7). Только внутренний путь: одиночный «/...»,
  // чтобы ?next=//evil.com не увёл на внешний сайт (open redirect).
  const nextParam = searchParams.get('next')
  const redirectTo = nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
    ? nextParam
    : '/'

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
      // Единый вход + слияние гостевой корзины (Ф8).
      await useAuthStore.getState().login(res.data)
      navigate(redirectTo)
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
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={MOTION}>

          {/* Вордмарк (бренд-гайд §4) */}
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <div className="w-10 h-10 bg-accent rounded-[10px] flex items-center justify-center">
                <span className="text-white font-display font-extrabold text-lg leading-none">М</span>
              </div>
              <span className="font-display font-extrabold text-xl tracking-tight text-ink">маркет</span>
            </Link>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink mt-6">
              {step === 1 ? 'Вход в аккаунт' : 'Подтвердите вход'}
            </h1>
            <p className="text-ink-faint text-sm mt-1">
              {step === 1 ? 'Введите ваши данные' : `Код отправлен на ${email}`}
            </p>
          </div>

          <div className="bg-card rounded-2xl shadow-lift border border-line p-8">

            {error && (
              <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
                className="bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-xl mb-5 text-sm flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {error}
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
                    <label className="block text-sm font-semibold text-ink-soft mb-1.5">Логин (Email)</label>
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full border border-line rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong transition bg-surface focus:bg-card"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-ink-soft mb-1.5">Пароль</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'} value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full border border-line rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong transition bg-surface focus:bg-card pr-24"
                        required
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint hover:text-ink-soft font-medium">
                        {showPassword ? 'Скрыть' : 'Показать'}
                      </button>
                    </div>
                  </div>

                  <div className="text-right">
                    <Link to="/forgot-password" className="text-xs text-accent hover:underline font-medium">
                        Забыли пароль?
                    </Link>
                   </div>

                  <motion.button
                    type="submit" disabled={loading}
                    className="w-full bg-ink text-white py-3.5 rounded-xl font-bold text-sm hover:bg-ink/90 transition disabled:opacity-50 mt-1 flex items-center justify-center gap-2"
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
                    <div className="w-14 h-14 bg-accent-soft rounded-2xl flex items-center justify-center mx-auto mb-3">
                      <svg className="w-7 h-7 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-ink-soft text-sm">Введите 6-значный код из письма</p>
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
                    className="w-full border border-line rounded-xl px-4 py-4 text-center text-3xl font-display font-extrabold tracking-[0.5em] text-ink placeholder:text-ink-faint focus:border-line-strong transition bg-surface focus:bg-card"
                    autoFocus
                  />

                  <motion.button
                    type="submit" disabled={loading || code.length !== 6}
                    className="w-full bg-ink text-white py-3.5 rounded-xl font-bold text-sm hover:bg-ink/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
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
                      className="text-sm text-ink-faint hover:text-accent transition disabled:cursor-not-allowed">
                      {resendCooldown > 0 ? `Отправить снова через ${resendCooldown}с` : 'Отправить код повторно'}
                    </button>
                  </div>

                  <button type="button" onClick={() => { setStep(1); setCode(''); setError('') }}
                    className="text-sm text-ink-faint hover:text-ink-soft text-center transition">
                    ← Изменить данные
                  </button>
                </motion.form>
              )}

            </AnimatePresence>

            {step === 1 && (
              <>
                <div className="relative my-5">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-line" /></div>
                  <div className="relative flex justify-center"><span className="bg-card px-3 text-xs text-ink-faint">или</span></div>
                </div>
                <p className="text-center text-ink-soft text-sm">
                  Нет аккаунта?{' '}
                  <Link to="/register" className="text-ink font-bold hover:underline">Зарегистрироваться</Link>
                </p>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
