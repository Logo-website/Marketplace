import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../api'
import useAuthStore from '../store/authStore'

const passwordChecks = [
  { id: 'length',  label: 'Не менее 8 символов',          test: (p) => p.length >= 8 },
  { id: 'upper',   label: 'Хотя бы одна заглавная буква', test: (p) => /[A-Z]/.test(p) },
  { id: 'digit',   label: 'Хотя бы одна цифра',           test: (p) => /\d/.test(p) },
  { id: 'special', label: 'Хотя бы один спецсимвол',      test: (p) => /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p) },
]

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
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-lg">
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
              {step === 1 ? 'Создать аккаунт' : 'Подтвердите email'}
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              {step === 1 ? 'Присоединяйтесь к нам' : `Код отправлен на ${form.email}`}
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10">

            {errors.general && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl mb-6 text-sm flex items-center gap-2">
                ⚠️ {errors.general}
              </motion.div>
            )}

            <AnimatePresence mode="wait">

              {/* Шаг 1 — форма регистрации */}
              {step === 1 && (
                <motion.div key="step1" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>

                  {/* Выбор роли */}
                  <div className="flex gap-3 mb-7">
                    {[
                      { value: 'buyer',  label: 'Покупатель', desc: 'Покупаю товары', icon: '🛒' },
                      { value: 'seller', label: 'Продавец',   desc: 'Продаю товары',  icon: '🏪' },
                    ].map((role) => (
                      <motion.button
                        key={role.value}
                        type="button"
                        onClick={() => setForm({ ...form, role: role.value })}
                        className={`flex-1 p-4 rounded-2xl border-2 text-left transition-all ${
                          form.role === role.value ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                        whileTap={{ scale: 0.97 }}
                      >
                        <div className="text-xl mb-1">{role.icon}</div>
                        <div className="font-semibold text-sm text-gray-800">{role.label}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{role.desc}</div>
                      </motion.button>
                    ))}
                  </div>

                  <form onSubmit={handleSubmit} className="flex flex-col gap-5">

                    {/* Логин */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Логин (Email)</label>
                      <input
                        type="email" name="email" value={form.email} onChange={handleChange}
                        placeholder="your@email.com"
                        className={`w-full border rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 transition bg-gray-50 focus:bg-white ${
                          errors.email ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-gray-200 focus:border-indigo-400 focus:ring-indigo-100'
                        }`}
                      />
                      {errors.email && <p className="text-xs text-red-500 mt-1.5">{errors.email}</p>}
                    </div>

                    {/* Имя */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-semibold text-gray-700">Имя пользователя</label>
                        <span className={`text-xs font-medium ${form.username.length > 12 ? 'text-amber-500' : 'text-gray-400'}`}>
                          {form.username.length}/15
                        </span>
                      </div>
                      <input
                        type="text" name="username" value={form.username} onChange={handleChange}
                        placeholder="username" maxLength={15}
                        className={`w-full border rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 transition bg-gray-50 focus:bg-white ${
                          errors.username ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-gray-200 focus:border-indigo-400 focus:ring-indigo-100'
                        }`}
                      />
                      {errors.username && <p className="text-xs text-red-500 mt-1.5">{errors.username}</p>}
                    </div>

                    {/* Пароль */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">Пароль</label>
                      <div className="relative">
                        <input
                          type={showPassword ? 'text' : 'password'} name="password"
                          value={form.password} onChange={handleChange}
                          onFocus={() => setPasswordFocused(true)} onBlur={() => setPasswordFocused(false)}
                          placeholder="••••••••"
                          className={`w-full border rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:ring-2 transition bg-gray-50 focus:bg-white pr-24 ${
                            errors.password ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-gray-200 focus:border-indigo-400 focus:ring-indigo-100'
                          }`}
                        />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-medium">
                          {showPassword ? 'Скрыть' : 'Показать'}
                        </button>
                      </div>

                      {form.password && (
                        <div className="mt-3">
                          <div className="flex gap-1 mb-2.5">
                            {[0,1,2,3].map(i => (
                              <div key={i} className={`h-1.5 flex-1 rounded-full transition-all ${
                                i < passStrength
                                  ? passStrength === 1 ? 'bg-red-400' : passStrength === 2 ? 'bg-amber-400' : passStrength === 3 ? 'bg-yellow-400' : 'bg-emerald-500'
                                  : 'bg-gray-200'
                              }`} />
                            ))}
                          </div>
                          <AnimatePresence>
                            {(passwordFocused || passStrength < 4) && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="grid grid-cols-2 gap-1.5">
                                {passwordChecks.map(check => (
                                  <div key={check.id} className={`flex items-center gap-1.5 text-sm transition-colors ${check.test(form.password) ? 'text-emerald-600' : 'text-gray-400'}`}>
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
                      {errors.password && <p className="text-sm text-red-500 mt-1.5">{errors.password}</p>}
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
                          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400 shrink-0"
                        />
                        <span className="text-xs text-gray-500 leading-relaxed">
                          Я принимаю{' '}
                          <Link to="/legal/oferta" target="_blank" className="text-indigo-600 hover:underline">оферту</Link>
                          {' '}и{' '}
                          <Link to="/legal/privacy" target="_blank" className="text-indigo-600 hover:underline">политику конфиденциальности</Link>
                        </span>
                      </label>
                      {errors.agreed && <p className="text-xs text-red-500 mt-1.5">{errors.agreed}</p>}
                    </div>

                    <motion.button
                      type="submit" disabled={loading}
                      className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-bold text-base hover:from-indigo-700 hover:to-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2 mt-1 shadow-lg shadow-indigo-100"
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
                    <div className="w-16 h-16 bg-indigo-50 rounded-2xl flex items-center justify-center text-3xl mx-auto mb-4">📧</div>
                    <p className="text-gray-600 text-sm">Введите 6-значный код из письма</p>
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
                        className={`w-full border rounded-xl px-4 py-4 text-center text-3xl font-black tracking-[0.5em] focus:outline-none focus:ring-2 transition bg-gray-50 focus:bg-white ${
                          errors.code ? 'border-red-300 focus:border-red-400 focus:ring-red-100' : 'border-gray-200 focus:border-indigo-400 focus:ring-indigo-100'
                        }`}
                        autoFocus
                      />
                      {errors.code && <p className="text-sm text-red-500 mt-1.5 text-center">{errors.code}</p>}
                    </div>

                    <motion.button
                      type="submit" disabled={loading || code.length !== 6}
                      className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-bold text-base hover:from-indigo-700 hover:to-purple-700 transition disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-indigo-100"
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
                        className="text-sm text-gray-400 hover:text-indigo-600 transition disabled:cursor-not-allowed"
                      >
                        {resendCooldown > 0 ? `Отправить снова через ${resendCooldown}с` : 'Отправить код повторно'}
                      </button>
                    </div>

                    <button type="button" onClick={() => setStep(1)} className="text-sm text-gray-400 hover:text-gray-600 text-center transition">
                      ← Изменить данные
                    </button>
                  </form>
                </motion.div>
              )}

            </AnimatePresence>

            {step === 1 && (
              <>
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-100" /></div>
                  <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-gray-400">или</span></div>
                </div>
                <p className="text-center text-gray-500 text-sm">
                  Уже есть аккаунт?{' '}
                  <Link to="/login" className="text-[#111] font-bold hover:underline">Войти</Link>
                </p>
              </>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  )
}