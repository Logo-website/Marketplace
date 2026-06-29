import { useState } from 'react'
import { motion } from 'framer-motion'
import api from '../../api'
import useAuthStore from '../../store/authStore'
import { toast } from '../../store/toastStore'

// Группы тумблеров (Ф10). Ключи совпадают с NOTIFICATION_KEYS на бэке; движок
// отправки - Ф25. «Заказы» транзакционные: статус своего заказа приходит всегда
// (отключить нельзя), поэтому тумблеров у строки нет.
const GROUPS = [
  { title: 'Заказы', description: 'Статусы и подтверждения заказов', transactional: true },
  { title: 'Акции и скидки', description: 'Новости и спецпредложения', email: 'promos_email', push: 'promos_push' },
  { title: 'Цена и наличие', description: 'Снижение цены, поступление товара', email: 'price_email', push: 'price_push' },
]

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={`w-10 h-6 rounded-full transition relative shrink-0 ${checked ? 'bg-ink' : 'bg-line-strong'}`}
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
      <h2 className="font-display text-xl font-bold text-ink mb-1">Уведомления</h2>
      <p className="text-sm text-ink-faint mb-5">Выберите, о чём вам сообщать. Уведомления о заказах приходят всегда.</p>

      <div className="bg-card rounded-2xl border border-line divide-y divide-line">
        <div className="hidden sm:flex items-center px-6 py-3 text-xs font-semibold text-ink-faint uppercase tracking-wide">
          <span className="flex-1">Тип</span>
          <span className="w-16 text-center">E-mail</span>
          <span className="w-16 text-center">Push</span>
        </div>
        {GROUPS.map((g) => (
          <div key={g.title} className="flex items-center px-6 py-4 gap-4">
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-ink text-sm">{g.title}</p>
              <p className="text-xs text-ink-faint">{g.description}</p>
            </div>
            {g.transactional ? (
              <div className="w-32 text-center text-xs font-medium text-ink-faint">Всегда включено</div>
            ) : (
              <>
                <div className="w-16 flex justify-center"><Toggle checked={!!prefs[g.email]} onChange={() => toggle(g.email)} /></div>
                <div className="w-16 flex justify-center"><Toggle checked={!!prefs[g.push]} onChange={() => toggle(g.push)} /></div>
              </>
            )}
          </div>
        ))}
      </div>

      <button onClick={save} disabled={saving} className="mt-5 text-xs font-semibold bg-ink text-white px-5 py-2.5 rounded-xl hover:bg-ink/90 transition disabled:opacity-50">
        {saving ? 'Сохранение...' : 'Сохранить настройки'}
      </button>
    </motion.div>
  )
}
