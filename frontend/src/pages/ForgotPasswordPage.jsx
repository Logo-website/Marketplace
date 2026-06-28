import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api'

const passwordChecks = [
  { id: 'length',  label: 'Не менее 8 символов',          test: (p) => p.length >= 8 },
  { id: 'upper',   label: 'Хотя бы одна заглавная буква', test: (p) => /[A-Z]/.test(p) },
  { id: 'digit',   label: 'Хотя бы одна цифра',           test: (p) => /\d/.test(p) },
  { id: 'special', label: 'Хотя бы один спецсимвол',      test: (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
]

export default function ForgotPasswordPage() {
  const [step, setStep] = useState(1) // 1=email, 2=код+новый пароль, 3=успех
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  const navigate = useNavigate()

  const handleRequestCode = async (e) => {
    e.preventDefault()
    if (!email) { setError('Введите email'); return }
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/password-reset/', { email })
      setStep(2)
      startCooldown()
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка отправки кода')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async (e) => {
    e.preventDefault()
    if (code.length !== 6) { setError('Введите 6-значный код'); return }
    if (!passwordChecks.every(c => c.test(password))) { setError('Пароль не соответствует требованиям'); return }
    if (password !== passwordConfirm) { setError('Пароли не совпадают'); return }
    setLoading(true)
    setError('')
    try {
      await api.post('/auth/password-reset/verify/', {
        email, code, password, password_confirm: passwordConfirm
      })
      setStep(3)
    } catch (err) {
      setError(err.response?.data?.error || 'Ошибка сброса пароля')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return
    setLoading(true)
    try {
      await api.post('/auth/password-reset/', { email })
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

  const passStrength = passwordChecks.filter(c => c.test(password)).length

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

          {/* Вордмарк (бренд-гайд §4) */}
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2.5">
              <div className="w-10 h-10 bg-accent rounded-[10px] flex items-center justify-center">
                <span className="text-white font-display font-extrabold text-lg leading-none">М</span>
              </div>
              <span className="font-display font-extrabold text-xl tracking-tight text-ink">маркет</span>
            </Link>
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink mt-6">
              {step === 1 && 'Восстановление пароля'}
              {step === 2 && 'Новый пароль'}
              {step === 3 && 'Пароль изменён'}
            </h1>
            <p className="text-ink-faint text-sm mt-1">
              {step === 1 && 'Введите email — отправим код подтверждения'}
              {step === 2 && `Код отправлен на ${email}`}
              {step === 3 && 'Теперь можете войти с новым паролем'}
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

              {/* Шаг 1 — email */}
              {step === 1 && (
                <motion.form key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                  onSubmit={handleRequestCode} className="flex flex-col gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-ink-soft mb-1.5">Email</label>
                    <input
                      type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full border border-line rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong transition bg-surface focus:bg-card"
                      required autoFocus
                    />
                  </div>
                  <motion.button type="submit" disabled={loading}
                    className="w-full bg-ink text-white py-3.5 rounded-xl font-bold text-sm hover:bg-ink/90 transition disabled:opacity-50 flex items-center justify-center gap-2 mt-1"
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                    {loading ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : 'Получить код →'}
                  </motion.button>
                </motion.form>
              )}

              {/* Шаг 2 — код + новый пароль */}
              {step === 2 && (
                <motion.form key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  onSubmit={handleResetPassword} className="flex flex-col gap-4">

                  {/* Код */}
                  <div>
                    <label className="block text-sm font-semibold text-ink-soft mb-1.5">Код из письма</label>
                    <input
                      type="text" value={code}
                      onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); setError('') }}
                      placeholder="000000" maxLength={6}
                      className="w-full border border-line rounded-xl px-4 py-4 text-center text-3xl font-display font-extrabold tracking-[0.5em] text-ink placeholder:text-ink-faint focus:border-line-strong transition bg-surface focus:bg-card"
                      autoFocus
                    />
                  </div>

                  {/* Новый пароль */}
                  <div>
                    <label className="block text-sm font-semibold text-ink-soft mb-1.5">Новый пароль</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'} value={password}
                        onChange={(e) => { setPassword(e.target.value); setError('') }}
                        onFocus={() => setPasswordFocused(true)} onBlur={() => setPasswordFocused(false)}
                        placeholder="••••••••"
                        className="w-full border border-line rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong transition bg-surface focus:bg-card pr-24"
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint hover:text-ink-soft font-medium">
                        {showPassword ? 'Скрыть' : 'Показать'}
                      </button>
                    </div>
                    {password && (
                      <div className="mt-2">
                        <div className="flex gap-1 mb-2">
                          {[0,1,2,3].map(i => (
                            <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${
                              i < passStrength
                                ? passStrength === 1 ? 'bg-danger' : passStrength <= 3 ? 'bg-warning' : 'bg-success'
                                : 'bg-line'
                            }`} />
                          ))}
                        </div>
                        <AnimatePresence>
                          {(passwordFocused || passStrength < 4) && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                              className="grid grid-cols-2 gap-1">
                              {passwordChecks.map(check => (
                                <div key={check.id} className={`flex items-center gap-1.5 text-xs transition-colors ${check.test(password) ? 'text-success' : 'text-ink-faint'}`}>
                                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    {check.test(password)
                                      ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                      : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    }
                                  </svg>
                                  {check.label}
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>

                  {/* Подтверждение пароля */}
                  <div>
                    <label className="block text-sm font-semibold text-ink-soft mb-1.5">Повторите пароль</label>
                    <div className="relative">
                      <input
                        type={showPasswordConfirm ? 'text' : 'password'} value={passwordConfirm}
                        onChange={(e) => { setPasswordConfirm(e.target.value); setError('') }}
                        placeholder="••••••••"
                        className={`w-full border rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong transition bg-surface focus:bg-card pr-24 ${
                          passwordConfirm && password !== passwordConfirm
                            ? 'border-danger'
                            : passwordConfirm && password === passwordConfirm
                            ? 'border-success'
                            : 'border-line focus:border-line-strong'
                        }`}
                      />
                      <button type="button" onClick={() => setShowPasswordConfirm(!showPasswordConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint hover:text-ink-soft font-medium">
                        {showPasswordConfirm ? 'Скрыть' : 'Показать'}
                      </button>
                    </div>
                    {passwordConfirm && password !== passwordConfirm && (
                      <p className="text-xs text-danger mt-1">Пароли не совпадают</p>
                    )}
                    {passwordConfirm && password === passwordConfirm && (
                      <p className="text-xs text-success mt-1">Пароли совпадают ✓</p>
                    )}
                  </div>

                  <motion.button type="submit" disabled={loading || code.length !== 6}
                    className="w-full bg-ink text-white py-3.5 rounded-xl font-bold text-sm hover:bg-ink/90 transition disabled:opacity-50 flex items-center justify-center gap-2 mt-1"
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}>
                    {loading ? (
                      <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : 'Сменить пароль'}
                  </motion.button>

                  <div className="text-center">
                    <button type="button" onClick={handleResend} disabled={resendCooldown > 0 || loading}
                      className="text-sm text-ink-faint hover:text-accent transition disabled:cursor-not-allowed">
                      {resendCooldown > 0 ? `Отправить снова через ${resendCooldown}с` : 'Отправить код повторно'}
                    </button>
                  </div>

                  <button type="button" onClick={() => { setStep(1); setCode(''); setError('') }}
                    className="text-sm text-ink-faint hover:text-ink-soft text-center transition">
                    ← Изменить email
                  </button>
                </motion.form>
              )}

              {/* Шаг 3 — успех */}
              {step === 3 && (
                <motion.div key="step3" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-4">
                  <motion.div
                    className="w-16 h-16 bg-success/10 rounded-2xl flex items-center justify-center mx-auto mb-5"
                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                    transition={{ type: 'spring', delay: 0.1 }}
                  >
                    <svg className="w-8 h-8 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>
                  <p className="text-ink-soft text-sm mb-6">Пароль успешно изменён. Теперь вы можете войти.</p>
                  <motion.button
                    onClick={() => navigate('/login')}
                    className="w-full bg-ink text-white py-3.5 rounded-xl font-bold text-sm hover:bg-ink/90 transition"
                    whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                  >
                    Войти →
                  </motion.button>
                </motion.div>
              )}

            </AnimatePresence>

            {step === 1 && (
              <p className="text-center text-ink-soft text-sm mt-6">
                Вспомнили пароль?{' '}
                <Link to="/login" className="text-ink font-bold hover:underline">Войти</Link>
              </p>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
