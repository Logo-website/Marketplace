import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { MOTION } from '../lib/motion'
import api from '../api'
import useAuthStore from '../store/authStore'

const passwordChecks = [
  { id: 'length',  label: 'Не менее 8 символов',          test: (p) => p.length >= 8 },
  { id: 'upper',   label: 'Хотя бы одна заглавная буква', test: (p) => /[A-Z]/.test(p) },
  { id: 'digit',   label: 'Хотя бы одна цифра',           test: (p) => /\d/.test(p) },
  { id: 'special', label: 'Хотя бы один спецсимвол',      test: (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
]

// Line-иконки ролей (бренд-гайд §4: иконки, не emoji).
const ROLE_ICONS = {
  buyer: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
  ),
  seller: (
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M3 9l1-4h16l1 4M3 9v10a1 1 0 001 1h16a1 1 0 001-1V9M3 9h18M9 13h6" />
  ),
}

export default function RegisterPage() {
  const [step, setStep] = useState(1) // 1 = форма, 2 = ввод кода
  const [form, setForm] = useState({ email: '', username: '', password: '', role: 'buyer' })
  const [code, setCode] = useState('')
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
  // Согласие с офертой/политикой (Ф26, §4.6). UX-валидация на регистрации:
  // без галочки код не запрашиваем. Сам факт согласия не храним (§11 в.3).
  const [agreed, setAgreed] = useState(false)
  const navigate = useNavigate()

  const handleChange = (e) => {
    const { name, value } = e.target
    if (name === 'username' && value.length > 15) return
    setForm({ ...form, [name]: value })
    if (errors[name]) setErrors({ ...errors, [name]: '' })
  }

  const validateFront = () => {
    const e = {}
    if (!form.email) e.email = 'Введите логин (email)'
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Некорректный email'
    if (!form.username) e.username = 'Введите имя пользователя'
    else if (form.username.length < 3) e.username = 'Минимум 3 символа'
    else if (form.username.length > 15) e.username = 'Максимум 15 символов'
    if (!form.password) e.password = 'Введите пароль'
    else if (!passwordChecks.every(c => c.test(form.password))) e.password = 'Пароль не соответствует требованиям'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const frontErrors = validateFront()
    if (!agreed) frontErrors.agreed = 'Подтвердите согласие с офертой и политикой'
    if (Object.keys(frontErrors).length > 0) {
      setErrors(frontErrors)
      return
    }
    setLoading(true)
    setErrors({})
    try {
      await api.post('/auth/register/', form)
      setStep(2)
      startCooldown()
    } catch (err) {
      const data = err.response?.data || {}
      setErrors({
        email: data.email?.[0],
        username: data.username?.[0],
        password: data.password?.[0],
        general: data.non_field_errors?.[0] || data.error || (!data.email && !data.username && !data.password ? 'Ошибка при регистрации' : ''),
      })
    } finally {
      setLoading(false)
    }
  }

  const handleVerify = async (e) => {
    e.preventDefault()
    if (code.length !== 6) {
      setErrors({ code: 'Введите 6-значный код' })
      return
    }
    setLoading(true)
    setErrors({})
    try {
      const res = await api.post('/auth/register/verify/', { email: form.email, code })
      // Единый вход + слияние гостевой корзины (Ф8).
      await useAuthStore.getState().login(res.data)
      navigate('/')
    } catch (err) {
      setErrors({ code: err.response?.data?.error || 'Неверный код' })
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    if (resendCooldown > 0) return
    setLoading(true)
    try {
      await api.post('/auth/register/', form)
      startCooldown()
      setErrors({})
    } catch {
      setErrors({ general: 'Ошибка повторной отправки' })
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

  const passStrength = passwordChecks.filter(c => c.test(form.password)).length

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
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
              {step === 1 ? 'Создать аккаунт' : 'Подтвердите email'}
            </h1>
            <p className="text-ink-faint text-sm mt-1">
              {step === 1 ? 'Присоединяйтесь к нам' : `Код отправлен на ${form.email}`}
            </p>
          </div>

          <div className="bg-card rounded-2xl shadow-lift border border-line p-10">

            {errors.general && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-danger/10 border border-danger/20 text-danger px-4 py-3 rounded-xl mb-6 text-sm flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
                {errors.general}
              </motion.div>
            )}

            <AnimatePresence mode="wait">

              {/* Шаг 1 — форма регистрации */}
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>

                  {/* Выбор роли */}
                  <div className="flex gap-3 mb-7">
                    {[
                      { value: 'buyer',  label: 'Покупатель', desc: 'Покупаю товары' },
                      { value: 'seller', label: 'Продавец',   desc: 'Продаю товары' },
                    ].map((role) => (
                      <motion.button
                        key={role.value}
                        type="button"
                        onClick={() => setForm({ ...form, role: role.value })}
                        className={`flex-1 p-4 rounded-2xl border-2 text-left transition-all ${
                          form.role === role.value ? 'border-accent bg-accent-soft' : 'border-line hover:border-line-strong'
                        }`}
                        whileTap={{ scale: 0.97 }}
                      >
                        <svg className={`w-6 h-6 mb-2 ${form.role === role.value ? 'text-accent' : 'text-ink-faint'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          {ROLE_ICONS[role.value]}
                        </svg>
                        <div className="font-semibold text-sm text-ink">{role.label}</div>
                        <div className="text-xs text-ink-faint mt-0.5">{role.desc}</div>
                      </motion.button>
                    ))}
                  </div>

                  <form onSubmit={handleSubmit} className="flex flex-col gap-5">

                    {/* Логин */}
                    <div>
                      <label className="block text-sm font-semibold text-ink-soft mb-2">Логин (Email)</label>
                      <input
                        type="email" name="email" value={form.email} onChange={handleChange}
                        placeholder="your@email.com"
                        className={`w-full border rounded-xl px-4 py-3.5 text-sm text-ink placeholder:text-ink-faint transition bg-surface focus:bg-card ${
                          errors.email ? 'border-danger' : 'border-line focus:border-line-strong'
                        }`}
                      />
                      {errors.email && <p className="text-xs text-danger mt-1.5">{errors.email}</p>}
                    </div>

                    {/* Имя */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold text-ink-soft">Имя пользователя</label>
                        <span className={`text-xs font-medium ${form.username.length > 12 ? 'text-warning' : 'text-ink-faint'}`}>
                          {form.username.length}/15
                        </span>
                      </div>
                      <input
                        type="text" name="username" value={form.username} onChange={handleChange}
                        placeholder="username" maxLength={15}
                        className={`w-full border rounded-xl px-4 py-3.5 text-sm text-ink placeholder:text-ink-faint transition bg-surface focus:bg-card ${
                          errors.username ? 'border-danger' : 'border-line focus:border-line-strong'
                        }`}
                      />
                      {errors.username && <p className="text-xs text-danger mt-1.5">{errors.username}</p>}
                    </div>

                    {/* Пароль */}
                    <div>
                      <label className="block text-sm font-semibold text-ink-soft mb-2">Пароль</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'} name="password"
                          value={form.password} onChange={handleChange}
                          onFocus={() => setPasswordFocused(true)} onBlur={() => setPasswordFocused(false)}
                          placeholder="••••••••"
                          className={`w-full border rounded-xl px-4 py-3.5 text-sm text-ink placeholder:text-ink-faint transition bg-surface focus:bg-card pr-24 ${
                            errors.password ? 'border-danger' : 'border-line focus:border-line-strong'
                          }`}
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint hover:text-ink-soft font-medium">
                          {showPassword ? 'Скрыть' : 'Показать'}
                        </button>
                      </div>

                      {form.password && (
                        <div className="mt-3">
                          <div className="flex gap-1 mb-2.5">
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
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="grid grid-cols-2 gap-1.5">
                                {passwordChecks.map(check => (
                                  <div key={check.id} className={`flex items-center gap-1.5 text-sm transition-colors ${check.test(form.password) ? 'text-success' : 'text-ink-faint'}`}>
                                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      {check.test(form.password)
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
                      {errors.password && <p className="text-sm text-danger mt-1.5">{errors.password}</p>}
                    </div>

                    {/* Согласие с офертой/политикой (Ф26) - со ссылками на документы */}
                    <div>
                      <label className="flex items-start gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox" checked={agreed}
                          onChange={(e) => {
                            setAgreed(e.target.checked)
                            if (errors.agreed) setErrors({ ...errors, agreed: '' })
                          }}
                          className="mt-0.5 w-4 h-4 rounded border-line accent-accent focus:ring-accent shrink-0"
                        />
                        <span className="text-xs text-ink-soft leading-relaxed">
                          Я принимаю{' '}
                          <Link to="/legal/oferta" target="_blank" className="text-accent hover:underline">оферту</Link>
                          {' '}и{' '}
                          <Link to="/legal/privacy" target="_blank" className="text-accent hover:underline">политику конфиденциальности</Link>
                        </span>
                      </label>
                      {errors.agreed && <p className="text-xs text-danger mt-1.5">{errors.agreed}</p>}
                    </div>

                    <motion.button
                      type="submit" disabled={loading}
                      className="w-full bg-ink text-white py-4 rounded-xl font-bold text-base hover:bg-ink/90 transition disabled:opacity-50 flex items-center justify-center gap-2 mt-1"
                      whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                    >
                      {loading ? (
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : 'Получить код →'}
                    </motion.button>
                  </form>
                </motion.div>
              )}

              {/* Шаг 2 — ввод кода */}
              {step === 2 && (
                <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>

                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-accent-soft rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <p className="text-ink-soft text-sm">Введите 6-значный код из письма</p>
                  </div>

                  <form onSubmit={handleVerify} className="flex flex-col gap-5">
                    <div>
                      <input
                        type="text" value={code}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '').slice(0, 6)
                          setCode(val)
                          if (errors.code) setErrors({})
                        }}
                        placeholder="000000"
                        maxLength={6}
                        className={`w-full border rounded-xl px-4 py-4 text-center text-3xl font-display font-extrabold tracking-[0.5em] text-ink placeholder:text-ink-faint transition bg-surface focus:bg-card ${
                          errors.code ? 'border-danger' : 'border-line focus:border-line-strong'
                        }`}
                        autoFocus
                      />
                      {errors.code && <p className="text-sm text-danger mt-1.5 text-center">{errors.code}</p>}
                    </div>

                    <motion.button
                      type="submit" disabled={loading || code.length !== 6}
                      className="w-full bg-ink text-white py-4 rounded-xl font-bold text-base hover:bg-ink/90 transition disabled:opacity-50 flex items-center justify-center gap-2"
                      whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                    >
                      {loading ? (
                        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : 'Подтвердить'}
                    </motion.button>

                    <div className="text-center">
                      <button
                        type="button" onClick={handleResend} disabled={resendCooldown > 0 || loading}
                        className="text-sm text-ink-faint hover:text-accent transition disabled:cursor-not-allowed"
                      >
                        {resendCooldown > 0 ? `Отправить снова через ${resendCooldown}с` : 'Отправить код повторно'}
                      </button>
                    </div>

                    <button type="button" onClick={() => setStep(1)} className="text-sm text-ink-faint hover:text-ink-soft text-center transition">
                      ← Изменить данные
                    </button>
                  </form>
                </motion.div>
              )}

            </AnimatePresence>

            {step === 1 && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-line" /></div>
                  <div className="relative flex justify-center"><span className="bg-card px-3 text-xs text-ink-faint">или</span></div>
                </div>
                <p className="text-center text-ink-soft text-sm">
                  Уже есть аккаунт?{' '}
                  <Link to="/login" className="text-ink font-bold hover:underline">Войти</Link>
                </p>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}
