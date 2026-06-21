import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api'
import useAuthStore from '../store/authStore'
import { toast } from '../store/toastStore'
import SellerProfileForm from '../components/seller/SellerProfileForm'
import { buildSellerPayload, emptySellerForm } from '../components/seller/sellerPayload'

// Онбординг «стать продавцом» (Ф11, /sell). Покупатель заполняет юр-данные,
// реквизиты, витрину, принимает оферту - сервер при полном комплекте флипает
// роль buyer -> seller и открывает кабинет. Уже-продавца сюда не пускаем.
export default function SellerOnboardingPage() {
  const { user, fetchProfile } = useAuthStore()
  const navigate = useNavigate()
  const [form, setForm] = useState(emptySellerForm)
  const [logoFile, setLogoFile] = useState(null)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  // Уже продавец - не вторая регистрация магазина, ведём в настройки.
  if (user?.role === 'seller') return <Navigate to="/seller/settings" replace />

  const setField = (key, value) => setForm((p) => ({ ...p, [key]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrors({})
    setSubmitting(true)
    try {
      const res = await api.post('/auth/seller/onboarding/', buildSellerPayload(form, logoFile))
      if (res.data.status === 'active') {
        // Роль сменилась на сервере - обновляем authStore без перелогина.
        await fetchProfile()
        toast.success('Вы стали продавцом!')
        navigate('/seller')
      } else {
        // Комплект неполный - черновик сохранён, подсказываем, чего не хватает.
        toast.info('Черновик сохранён. Заполните все поля и примите оферту для активации.')
      }
    } catch (err) {
      const data = err.response?.data
      if (data && typeof data === 'object') setErrors(data)
      toast.error('Проверьте правильность заполнения')
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
          <div className="relative">
            <p className="text-xs font-semibold text-indigo-400 uppercase tracking-widest mb-1">Продавцам</p>
            <h1 className="text-2xl font-black text-white">Стать продавцом</h1>
            <p className="text-gray-400 text-sm mt-1">
              Заполните данные - и откроется кабинет для продажи товаров.
            </p>
          </div>
        </motion.div>

        <SellerProfileForm
          form={form}
          setField={setField}
          errors={errors}
          onSubmit={handleSubmit}
          submitting={submitting}
          logoFile={logoFile}
          setLogoFile={setLogoFile}
          mode="onboarding"
        />
      </div>
    </div>
  )
}
