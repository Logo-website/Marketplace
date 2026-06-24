import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import api from '../../api'
import useAuthStore from '../../store/authStore'

// Inline-редактирование одного поля профиля (email/имя/телефон). Вынесено из
// ProfilePage при сборке оболочки кабинета (Ф10), чтобы MyDataTab переиспользовал
// готовый отлаженный виджет, а не дублировал его.
export default function ProfileField({ label, fieldKey, value, type, icon, description, readOnly }) {
  const { fetchProfile } = useAuthStore()
  const [editing, setEditing] = useState(false)
  const [inputValue, setInputValue] = useState(value || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      await api.patch('/auth/profile/', { [fieldKey]: inputValue })
      await fetchProfile()
      setEditing(false)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setError(err.response?.data?.[fieldKey]?.[0] || 'Ошибка при сохранении')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    setEditing(false)
    setInputValue(value || '')
    setError('')
  }

  return (
    <motion.div layout className="relative">
      <div className={`p-5 rounded-2xl border transition-all duration-200 ${
        editing ? 'border-indigo-200 bg-indigo-50/30 shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
              editing ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-500'
            }`}>
              {icon}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
                {saved && (
                  <motion.span initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-xs text-emerald-500 font-semibold flex items-center gap-1">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    Сохранено
                  </motion.span>
                )}
              </div>

              <AnimatePresence mode="wait">
                {editing ? (
                  <motion.div key="editing" initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -5 }} className="flex flex-col gap-2 mt-1">
                    <input
                      type={type}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSave()
                        if (e.key === 'Escape') handleCancel()
                      }}
                      className="w-full border border-indigo-300 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200 bg-white font-medium"
                      autoFocus
                      placeholder={`Введите ${label.toLowerCase()}...`}
                    />
                    {error && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        {error}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <motion.button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 text-xs bg-[#111] text-white px-4 py-2 rounded-xl hover:bg-gray-800 transition disabled:opacity-50 font-semibold" whileTap={{ scale: 0.97 }}>
                        {saving ? 'Сохранение...' : 'Сохранить'}
                      </motion.button>
                      <button onClick={handleCancel} className="text-xs text-gray-400 hover:text-gray-600 px-3 py-2 rounded-xl hover:bg-gray-100 transition font-medium">
                        Отмена
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div key="display" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">
                      {value || <span className="text-gray-300 font-normal">Не указано</span>}
                    </p>
                    {description && <p className="text-xs text-gray-400 mt-0.5">{description}</p>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {!editing && !readOnly && (
            <motion.button onClick={() => setEditing(true)} className="shrink-0 flex items-center gap-1.5 text-xs text-gray-400 hover:text-[#111] px-3 py-1.5 rounded-xl hover:bg-gray-100 transition font-medium mt-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Изменить
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
