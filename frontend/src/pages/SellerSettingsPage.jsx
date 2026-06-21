import { useEffect, useState } from 'react'
import { Navigate, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api'
import useAuthStore from '../store/authStore'
import { toast } from '../store/toastStore'
import SellerProfileForm from '../components/seller/SellerProfileForm'
import { buildSellerPayload, emptySellerForm } from '../components/seller/sellerPayload'

// Настройки активного магазина (Ф11, /seller/settings, узел 2.14). Те же поля,
// что в онбординге, но в режиме редактирования через PATCH. Доступ - только
// продавцу; не-продавца ведём в онбординг.
export default function SellerSettingsPage() {
  const { user, fetchProfile } = useAuthStore()
  const [form, setForm] = useState(emptySellerForm)
  const [logoFile, setLogoFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const res = await api.get('/auth/seller/profile/')
        if (!alive) return
        const d = res.data
        // Пустые поля приводим к '' - форма контролируемая.
        setForm({
          legal_status: d.legal_status || 'self_employed',
          legal_name: d.legal_name || '',
          inn: d.inn || '',
          bank_account: d.bank_account || '',
          bank_bik: d.bank_bik || '',
          shop_name: d.shop_name || '',
          shop_description: d.shop_description || '',
          shop_logo: d.shop_logo || null,
          tariff: d.tariff || 'free',
          offer_accepted: !!d.offer_accepted,
        })
      } catch {
        // Профиля нет/ошибка - форма останется пустой, сохранение покажет ошибку.
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [])

  // Гейт: настройки только продавцу. Не-продавца - в онбординг.
  if (user && user.role !== 'seller') return <Navigate to="/sell" replace />

  const setField = (key, value) => setForm((p) => ({ ...p, [key]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrors({})
    setSubmitting(true)
    try {
      await api.patch('/auth/seller/profile/', buildSellerPayload(form, logoFile))
      // shop_name живёт на User - обновим профиль, чтобы шапка/каталог увидели.
      await fetchProfile()
      setLogoFile(null)
      toast.success('Настройки сохранены')
    } catch (err) {
      const data = err.response?.data
      if (data && typeof data === 'object') setErrors(data)
      toast.error(data?.detail || 'Не удалось сохранить настройки')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#111] rounded-2xl p-6 mb-6 relative overflow-hidden"
        >
          <div className="absolute inset-0 opacity-10"
            style={{ background: 'radial-gradient(circle at 90% 50%, #6366f1 0%, transparent 60%)' }}
          />
          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-1">Магазин</p>
              <h1 className="text-2xl font-black text-white">Настройки магазина</h1>
              <p className="text-gray-400 text-sm mt-1">Юр-данные, реквизиты, витрина и тариф</p>
            </div>
            <Link
              to="/seller"
              className="hidden sm:block px-4 py-2.5 rounded-xl bg-white/10 text-white text-sm font-semibold hover:bg-white/15 transition"
            >
              В кабинет
            </Link>
          </div>
        </motion.div>

        {loading ? (
          <div className="flex flex-col gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-2xl h-40 skeleton" />
            ))}
          </div>
        ) : (
          <SellerProfileForm
            form={form}
            setField={setField}
            errors={errors}
            onSubmit={handleSubmit}
            submitting={submitting}
            logoFile={logoFile}
            setLogoFile={setLogoFile}
            mode="settings"
          />
        )}
      </div>
    </div>
  )
}
