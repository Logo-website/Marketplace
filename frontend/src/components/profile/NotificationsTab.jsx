import { useState } from 'react'
import { motion } from 'framer-motion'
import api from '../../api'
import useAuthStore from '../../store/authStore'
import { toast } from '../../store/toastStore'

// Группы тумблеров (Ф10). Ключи совпадают с NOTIFICATION_KEYS на бэке. Хранение
// здесь, реальная отправка - Ф25 (в UI честно помечено).
const GROUPS = [
  { title: 'Заказы', description: 'Статусы и подтверждения заказов', email: 'orders_email', push: 'orders_push' },
  { title: 'Акции и скидки', description: 'Новости и спецпредложения', email: 'promos_email', push: 'promos_push' },
  { title: 'Цена и наличие', description: 'Снижение цены, поступление товара', email: 'price_email', push: 'price_push' },
]

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`w-10 h-6 rounded-full transition relative shrink-0 ${checked ? 'bg-[#111]' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

export default function NotificationsTab() {
  const { user, fetchProfile } = useAuthStore()
  const [prefs, setPrefs] = useState(() => user?.notification_prefs || {})
  const [saving, setSaving] = useState(false)

  const toggle = (key) => setPrefs((p) => ({ ...p, [key]: !p[key] }))

  const save = async () => {
    setSaving(true)
    try {
      await api.patch('/auth/profile/', { notification_prefs: prefs })
      await fetchProfile()
      toast.success('Настройки сохранены')
    } catch {
      toast.error('Не удалось сохранить настройки')
    } finally {
      setSaving(false)
    }
  }

  return (
    <motion.div key="notifications" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <h2 className="text-xl font-black text-gray-900 mb-1">Уведомления</h2>
      <p className="text-sm text-gray-400 mb-5">Выберите, о чём вам сообщать. Рассылки заработают в одном из следующих обновлений.</p>

      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50">
        <div className="hidden sm:flex items-center px-6 py-3 text-xs font-semibold text-gray-400 uppercase tracking-wide">
          <span className="flex-1">Тип</span>
          <span className="w-16 text-center">E-mail</span>
          <span className="w-16 text-center">Push</span>
        </div>
        {GROUPS.map((g) => (
          <div key={g.title} className="flex items-center px-6 py-4 gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-800 text-sm">{g.title}</p>
              <p className="text-xs text-gray-400">{g.description}</p>
            </div>
            <div className="w-16 flex justify-center"><Toggle checked={!!prefs[g.email]} onChange={() => toggle(g.email)} /></div>
            <div className="w-16 flex justify-center"><Toggle checked={!!prefs[g.push]} onChange={() => toggle(g.push)} /></div>
          </div>
        ))}
      </div>

      <button onClick={save} disabled={saving} className="mt-5 text-xs font-semibold bg-[#111] text-white px-5 py-2.5 rounded-xl hover:bg-gray-800 transition disabled:opacity-50">
        {saving ? 'Сохранение...' : 'Сохранить настройки'}
      </button>
    </motion.div>
  )
}
