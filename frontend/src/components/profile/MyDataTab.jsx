import { useState } from 'react'
import { motion } from 'framer-motion'
import api from '../../api'
import useAuthStore from '../../store/authStore'
import { toast } from '../../store/toastStore'
import ProfileField from './ProfileField'

// Параметры фигуры (Ф10): хранятся в body_params, потребитель - подбор размера
// Ф5. Числовые с подсказкой диапазона (бэк валидирует тот же диапазон).
const BODY_FIELDS = [
  { key: 'height', label: 'Рост, см', placeholder: '170', type: 'number' },
  { key: 'chest', label: 'Обхват груди, см', placeholder: '90', type: 'number' },
  { key: 'waist', label: 'Обхват талии, см', placeholder: '70', type: 'number' },
  { key: 'hips', label: 'Обхват бёдер, см', placeholder: '95', type: 'number' },
  { key: 'shoe_size', label: 'Размер обуви (EU)', placeholder: '42', type: 'number' },
  { key: 'clothing_size', label: 'Размер одежды', placeholder: 'M', type: 'text' },
]

// Первое читаемое сообщение об ошибке из ответа DRF (поля или non_field_errors).
function firstError(data, fallback) {
  if (!data) return fallback
  if (typeof data === 'string') return data
  for (const v of Object.values(data)) {
    if (Array.isArray(v) && v.length) return v[0]
    if (typeof v === 'string') return v
  }
  return fallback
}

export default function MyDataTab() {
  const { user, fetchProfile } = useAuthStore()

  const PROFILE_FIELDS = [
    {
      fieldKey: 'email', label: 'Email', value: user?.email, type: 'email', readOnly: true,
      description: 'Используется для входа. Сменить email пока нельзя',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
    },
    {
      fieldKey: 'username', label: 'Имя пользователя', value: user?.username, type: 'text',
      description: 'Отображается на сайте',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>,
    },
    {
      fieldKey: 'phone', label: 'Телефон', value: user?.phone || '', type: 'tel',
      description: 'Для связи по заказам',
      icon: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>,
    },
  ]

  // --- Параметры фигуры ---
  const [body, setBody] = useState(() => {
    const src = user?.body_params || {}
    const init = {}
    BODY_FIELDS.forEach((f) => { init[f.key] = src[f.key] ?? '' })
    return init
  })
  const [bodySaving, setBodySaving] = useState(false)

  const saveBody = async () => {
    setBodySaving(true)
    // Пустые значения отправляем как '' - сериализатор трактует как очистку.
    const payload = {}
    BODY_FIELDS.forEach((f) => { payload[f.key] = body[f.key] === '' ? '' : body[f.key] })
    try {
      await api.patch('/auth/profile/', { body_params: payload })
      await fetchProfile()
      toast.success('Параметры сохранены')
    } catch (err) {
      toast.error(firstError(err.response?.data?.body_params || err.response?.data, 'Ошибка сохранения'))
    } finally {
      setBodySaving(false)
    }
  }

  // --- Смена пароля ---
  const [pwd, setPwd] = useState({ old_password: '', new_password: '', new_password_confirm: '' })
  const [pwdSaving, setPwdSaving] = useState(false)

  const savePassword = async (e) => {
    e.preventDefault()
    setPwdSaving(true)
    try {
      await api.post('/auth/password-change/', pwd)
      toast.success('Пароль изменён')
      setPwd({ old_password: '', new_password: '', new_password_confirm: '' })
    } catch (err) {
      toast.error(firstError(err.response?.data, 'Не удалось изменить пароль'))
    } finally {
      setPwdSaving(false)
    }
  }

  const inputCls = 'w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white'

  return (
    <motion.div key="data" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <h2 className="text-xl font-black text-gray-900 mb-1">Мои данные</h2>
      <p className="text-sm text-gray-400 mb-6">Управляйте личными данными и параметрами</p>

      {/* Контактные данные */}
      <div className="flex flex-col gap-3 mb-8">
        {PROFILE_FIELDS.map((f) => <ProfileField key={f.fieldKey} {...f} />)}
      </div>

      {/* Роль */}
      <div className="p-5 rounded-2xl border border-gray-100 bg-white mb-8">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Роль</p>
            <p className="text-sm font-semibold text-gray-900 mt-0.5">
              {user?.role === 'buyer' ? 'Покупатель' : user?.role === 'seller' ? 'Продавец' : 'Администратор'}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">Роль нельзя изменить самостоятельно</p>
          </div>
        </div>
      </div>

      {/* Параметры фигуры */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6 mb-8">
        <h3 className="text-base font-bold text-gray-900 mb-1">Параметры фигуры</h3>
        <p className="text-xs text-gray-400 mb-5">Поможем подобрать размер. Необязательно.</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
          {BODY_FIELDS.map((f) => (
            <div key={f.key}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}</label>
              <input
                type={f.type}
                value={body[f.key]}
                placeholder={f.placeholder}
                onChange={(e) => setBody((p) => ({ ...p, [f.key]: e.target.value }))}
                className={inputCls}
              />
            </div>
          ))}
        </div>
        <button onClick={saveBody} disabled={bodySaving} className="text-xs font-semibold bg-[#111] text-white px-5 py-2.5 rounded-xl hover:bg-gray-800 transition disabled:opacity-50">
          {bodySaving ? 'Сохранение...' : 'Сохранить параметры'}
        </button>
      </section>

      {/* Смена пароля */}
      <section className="bg-white rounded-2xl border border-gray-100 p-6">
        <h3 className="text-base font-bold text-gray-900 mb-5">Сменить пароль</h3>
        <form onSubmit={savePassword} className="flex flex-col gap-3 max-w-sm">
          <input type="password" required placeholder="Текущий пароль" value={pwd.old_password} onChange={(e) => setPwd((p) => ({ ...p, old_password: e.target.value }))} className={inputCls} autoComplete="current-password" />
          <input type="password" required placeholder="Новый пароль" value={pwd.new_password} onChange={(e) => setPwd((p) => ({ ...p, new_password: e.target.value }))} className={inputCls} autoComplete="new-password" />
          <input type="password" required placeholder="Повторите новый пароль" value={pwd.new_password_confirm} onChange={(e) => setPwd((p) => ({ ...p, new_password_confirm: e.target.value }))} className={inputCls} autoComplete="new-password" />
          <p className="text-xs text-gray-400">Минимум 8 символов, заглавная буква, цифра и спецсимвол.</p>
          <button type="submit" disabled={pwdSaving} className="self-start text-xs font-semibold bg-[#111] text-white px-5 py-2.5 rounded-xl hover:bg-gray-800 transition disabled:opacity-50">
            {pwdSaving ? 'Сохранение...' : 'Сменить пароль'}
          </button>
        </form>
      </section>
    </motion.div>
  )
}
