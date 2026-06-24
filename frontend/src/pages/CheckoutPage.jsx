import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import useCartStore, { itemKey } from '../store/cartStore'
import useAuthStore from '../store/authStore'
import api from '../api'
import { toast } from '../store/toastStore'
import ReceiptCard from '../components/ReceiptCard'

const PICKUP_POINTS = [
  { id: 1,  address: 'ул. Ленина, 12, ТЦ Центральный',    time: 'Сегодня, 18:00',      metro: 'Площадь Ленина' },
  { id: 2,  address: 'пр. Мира, 45, Почта России',          time: 'Завтра, 10:00',       metro: 'Проспект Мира' },
  { id: 3,  address: 'ул. Советская, 78, PickPoint',        time: 'Сегодня, 20:00',      metro: 'Советская' },
  { id: 4,  address: 'ул. Гагарина, 33, Boxberry',          time: 'Завтра, 12:00',       metro: 'Гагаринская' },
  { id: 5,  address: 'пр. Победы, 101, СДЭК',              time: 'Сегодня, 19:00',      metro: 'Площадь Победы' },
  { id: 6,  address: 'ул. Пушкина, 5, Ozon Пункт',         time: 'Завтра, 09:00',       metro: 'Пушкинская' },
  { id: 7,  address: 'ул. Чехова, 22, ПВЗ Wildberries',    time: 'Сегодня, 21:00',      metro: 'Чеховская' },
  { id: 8,  address: 'пр. Строителей, 67, Hermes',          time: 'Завтра, 11:00',       metro: 'Строительная' },
  { id: 9,  address: 'ул. Садовая, 14, DPD',               time: 'Послезавтра, 10:00',  metro: 'Садовая' },
  { id: 10, address: 'ул. Молодёжная, 88, СДЭК',           time: 'Завтра, 14:00',       metro: 'Молодёжная' },
  { id: 11, address: 'пр. Комсомольский, 3, Boxberry',     time: 'Сегодня, 20:00',      metro: 'Комсомольская' },
  { id: 12, address: 'ул. Октябрьская, 55, PickPoint',     time: 'Завтра, 16:00',       metro: 'Октябрьская' },
  { id: 13, address: 'ул. Новая, 19, Почта России',        time: 'Послезавтра, 12:00',  metro: 'Новогиреево' },
  { id: 14, address: 'пр. Северный, 44, Ozon Пункт',       time: 'Завтра, 10:00',       metro: 'Северная' },
  { id: 15, address: 'ул. Зелёная, 7, СДЭК',              time: 'Сегодня, 18:30',      metro: 'Зеленоград' },
]

const DELIVERY_METHODS = [
  {
    id: 'pickup', label: 'Самовывоз', desc: 'Бесплатно',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    id: 'courier', label: 'Курьер', desc: 'от 299 ₽',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0" />
      </svg>
    ),
  },
  {
    id: 'post', label: 'Почта России', desc: 'от 199 ₽',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
]

// Способы оплаты (Ф9). Заглушка: способ сохраняется, реального эквайринга нет (4.5).
const PAYMENT_METHODS = [
  { id: 'card',        label: 'Картой онлайн',  desc: 'Демо-оплата' },
  { id: 'on_delivery', label: 'При получении',  desc: 'Наличными или картой' },
  { id: 'installments', label: 'Частями',       desc: 'Демо-рассрочка' },
]

// Человекочитаемый статус заказа на экране «Спасибо» (Ф9).
const STATUS_LABELS = {
  created: 'Создан', paid: 'Оплачен', processing: 'В обработке',
  shipped: 'Отправлен', delivered: 'Доставлен', cancelled: 'Отменён',
}

const GUARANTEES = [
  {
    label: 'Безопасная оплата',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    label: 'Возврат 30 дней',
    icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
]

export default function CheckoutPage() {
  const { items, fetchCart } = useCartStore()
  const { user } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  // Выбранные в корзине позиции (Ф8 этап 5). Прямой заход без выбора -> вся
  // корзина (обратная совместимость).
  const selectedKeys = location.state?.selectedKeys || null
  const orderItems = selectedKeys
    ? items.filter((i) => selectedKeys.includes(itemKey(i)))
    : items
  const orderTotal = orderItems.reduce((sum, i) => sum + Number(i.total), 0)
  const [deliveryMethod, setDeliveryMethod] = useState('pickup')
  const [selectedPoint, setSelectedPoint] = useState(null)
  const [address, setAddress] = useState('')
  const [comment, setComment] = useState('')
  // Получатель (Ф9 этап 2): префилл из профиля, поля редактируемые.
  const [recipientName, setRecipientName] = useState('')
  const [recipientPhone, setRecipientPhone] = useState('')
  const [recipientEmail, setRecipientEmail] = useState('')
  // Оплата (Ф9 этап 3): заглушка, способ только сохраняется в заказ.
  const [paymentMethod, setPaymentMethod] = useState('card')
  const [loading, setLoading] = useState(false)
  // Согласие с офертой (Ф26, §4.6). На сервере - guard на оформлении: без
  // accept_offer заказ не создаётся (дословный критерий «без них нельзя
  // принимать оплату»).
  const [agreed, setAgreed] = useState(false)
  const [success, setSuccess] = useState(false)
  const [countdown, setCountdown] = useState(5)
  const [orderSummary, setOrderSummary] = useState({ count: 0, total: '0', method: 'pickup', id: null, status: 'created', receipt: null })

  // Префилл получателя из профиля - один раз, когда профиль подгрузился. Дальше
  // поля редактируемые (можно оформить на другого человека), повторно не затираем.
  const prefilled = useRef(false)
  useEffect(() => {
    if (user && !prefilled.current) {
      setRecipientName(user.username || '')
      setRecipientPhone(user.phone || '')
      setRecipientEmail(user.email || '')
      prefilled.current = true
    }
  }, [user])

  const handleOrder = async () => {
    if (!recipientName.trim()) {
      toast.error('Укажите имя получателя')
      return
    }
    if (!recipientPhone.trim()) {
      toast.error('Укажите телефон получателя')
      return
    }
    if (deliveryMethod === 'pickup' && !selectedPoint) {
      toast.error('Выберите пункт выдачи')
      return
    }
    if (deliveryMethod !== 'pickup' && !address) {
      toast.error('Укажите адрес доставки')
      return
    }
    if (!agreed) {
      toast.error('Подтвердите согласие с офертой')
      return
    }

    setLoading(true)
    const deliveryAddress = deliveryMethod === 'pickup'
      ? PICKUP_POINTS.find(p => p.id === selectedPoint)?.address
      : address
    // Передаём ровно выбранные позиции; без выбора - бэкенд берёт всю корзину.
    const payload = {
      delivery_address: deliveryAddress,
      comment,
      recipient_name: recipientName.trim(),
      recipient_phone: recipientPhone.trim(),
      recipient_email: recipientEmail.trim(),
      delivery_method: deliveryMethod,
      payment_method: paymentMethod,
      accept_offer: agreed,
    }
    if (selectedKeys) {
      payload.items = orderItems.map((i) => ({
        product_id: i.product_id, size: i.size || '', color: i.color || '',
      }))
    }
    try {
      const res = await api.post('/orders/from-cart/', payload)
      // Перечитываем корзину: бэкенд убрал только оформленные позиции,
      // невыбранное остаётся (не clearCart всей корзины).
      await fetchCart()
      setOrderSummary({
        count: orderItems.length, total: String(orderTotal), method: deliveryMethod,
        id: res.data?.id ?? null, status: res.data?.status ?? 'created',
        receipt: res.data?.receipt ?? null,
      })
      setSuccess(true)
      let count = 5
      const timer = setInterval(() => {
        count -= 1
        setCountdown(count)
        if (count <= 0) {
            clearInterval(timer)
            navigate('/profile')
        }
      }, 1000)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Ошибка при оформлении заказа')
    } finally {
      setLoading(false)
    }
  }

  if (success) return (
    <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm max-w-md w-full p-8"
      >
        {/* Иконка */}
        <motion.div
          className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center mx-auto mb-6"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.15 }}
        >
          <svg className="w-8 h-8 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </motion.div>

        {/* Заголовок */}
        <h2 className="text-2xl font-black text-gray-900 text-center mb-1">Заказ оформлен!</h2>
        <p className="text-gray-400 text-sm text-center mb-6">Спасибо за покупку в Marketplace</p>

        {/* Детали заказа */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6 flex flex-col gap-3">
          {orderSummary.id ? (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Номер заказа</span>
              <span className="font-black text-gray-900">#{orderSummary.id}</span>
            </div>
          ) : null}
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Статус</span>
            <span className="font-semibold text-indigo-600">{STATUS_LABELS[orderSummary.status] ?? 'Создан'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Товаров</span>
            <span className="font-semibold text-gray-900">{orderSummary.count} шт.</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Сумма</span>
            <span className="font-black text-gray-900">{Number(orderSummary.total).toLocaleString()} ₽</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Доставка</span>
            <span className="font-semibold text-emerald-600">
              {orderSummary.method === 'pickup' ? 'Бесплатно' : 'от 299 ₽'}
            </span>
          </div>
        </div>

        {/* Чек 54-ФЗ (Ф26) - эмуляция, виден сразу после оформления */}
        {orderSummary.receipt && (
          <div className="mb-6">
            <ReceiptCard receipt={orderSummary.receipt} />
          </div>
        )}

        {/* Что дальше */}
        <div className="flex flex-col gap-2 mb-6">
          {[
            { icon: '📧', text: 'Подтверждение отправлено на вашу почту' },
            { icon: '📦', text: 'Следите за статусом в личном кабинете' },
            { icon: '💬', text: 'При вопросах — напишите в поддержку' },
          ].map((item, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.08 }}
              className="flex items-center gap-3 text-sm text-gray-500"
            >
              <span className="text-base">{item.icon}</span>
              {item.text}
            </motion.div>
          ))}
        </div>

        {/* Таймер */}
        <div className="text-center">
          <p className="text-xs text-gray-400 mb-3">
            Переход в личный кабинет через {countdown} сек.
          </p>
          <motion.button
            onClick={() => navigate('/profile')}
            className="w-full bg-[#111] text-white py-3 rounded-xl font-semibold text-sm hover:bg-gray-800 transition"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            Перейти в личный кабинет →
          </motion.button>
        </div>
      </motion.div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <div className="max-w-6xl mx-auto px-4 py-8">

        {/* Назад */}
        <motion.button
          onClick={() => navigate('/cart')}
          className="flex items-center gap-2 text-gray-400 hover:text-gray-700 transition mb-6 text-sm font-medium"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          whileTap={{ scale: 0.97 }}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Вернуться в корзину
        </motion.button>

        <motion.h1
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-black text-gray-900 mb-8"
        >
          Оформление заказа
        </motion.h1>

        <div className="flex flex-col lg:flex-row gap-6">

          {/* Левая часть */}
          <div className="flex-1 flex flex-col gap-4">

            {/* Получатель */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="bg-white rounded-2xl p-6 border border-gray-100"
            >
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Получатель</h2>
              <div className="flex flex-col gap-3">
                {/* maxLength совпадает с капами модели (стресс-тест F4):
                    defense-in-depth, бэкенд валидирует длину независимо. */}
                <input
                  type="text" placeholder="Имя и фамилия *" value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)} maxLength={200}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50 focus:bg-white"
                />
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    type="tel" placeholder="Телефон *" value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)} maxLength={20}
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50 focus:bg-white"
                  />
                  <input
                    type="email" placeholder="E-mail" value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)} maxLength={254}
                    className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50 focus:bg-white"
                  />
                </div>
              </div>
            </motion.div>

            {/* Способ доставки */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white rounded-2xl p-6 border border-gray-100"
            >
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Способ доставки</h2>
              <div className="flex gap-3">
                {DELIVERY_METHODS.map(method => (
                  <motion.button
                    key={method.id}
                    onClick={() => setDeliveryMethod(method.id)}
                    className={`flex-1 p-4 rounded-2xl border-2 text-left transition-all ${
                      deliveryMethod === method.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <div className={`mb-2 ${deliveryMethod === method.id ? 'text-indigo-600' : 'text-gray-400'}`}>
                      {method.icon}
                    </div>
                    <div className="font-semibold text-sm text-gray-800">{method.label}</div>
                    <div className={`text-xs font-medium mt-0.5 ${deliveryMethod === method.id ? 'text-indigo-500' : 'text-gray-400'}`}>
                      {method.desc}
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>

            {/* Пункты выдачи / Адрес */}
            <AnimatePresence>
              {deliveryMethod === 'pickup' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-white rounded-2xl p-6 border border-gray-100 overflow-hidden"
                >
                  <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Пункт выдачи</h2>
                  <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
                    {PICKUP_POINTS.map(point => (
                      <motion.button
                        key={point.id}
                        onClick={() => setSelectedPoint(point.id)}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${
                          selectedPoint === point.id
                            ? 'border-indigo-500 bg-indigo-50'
                            : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                        }`}
                        whileHover={{ scale: 1.005 }}
                        whileTap={{ scale: 0.998 }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-sm text-gray-800">{point.address}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{point.metro}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={`text-xs font-semibold ${selectedPoint === point.id ? 'text-indigo-600' : 'text-emerald-600'}`}>
                              {point.time}
                            </p>
                            {selectedPoint === point.id && (
                              <span className="text-indigo-500 text-xs">✓</span>
                            )}
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </motion.div>
              )}

              {deliveryMethod !== 'pickup' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="bg-white rounded-2xl p-6 border border-gray-100 overflow-hidden"
                >
                  <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Адрес доставки</h2>
                  <input
                    type="text" placeholder="Введите адрес *" value={address} onChange={(e) => setAddress(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50 focus:bg-white"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Оплата - заглушка (Ф9 этап 3): способ сохраняется, эквайринга нет (4.5) */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.13 }}
              className="bg-white rounded-2xl p-6 border border-gray-100"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Оплата</h2>
                <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">демо</span>
              </div>
              <div className="flex flex-col gap-2">
                {PAYMENT_METHODS.map(method => (
                  <motion.button
                    key={method.id}
                    onClick={() => setPaymentMethod(method.id)}
                    className={`flex items-center justify-between p-4 rounded-xl border-2 text-left transition-all ${
                      paymentMethod === method.id
                        ? 'border-indigo-500 bg-indigo-50'
                        : 'border-gray-100 hover:border-gray-200 bg-gray-50'
                    }`}
                    whileTap={{ scale: 0.99 }}
                  >
                    <div>
                      <div className="font-semibold text-sm text-gray-800">{method.label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{method.desc}</div>
                    </div>
                    <span className={`w-4 h-4 rounded-full border-2 shrink-0 ${
                      paymentMethod === method.id ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'
                    }`} />
                  </motion.button>
                ))}
              </div>
            </motion.div>

            {/* Комментарий */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-white rounded-2xl p-6 border border-gray-100"
            >
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Комментарий</h2>
              <textarea
                placeholder="Необязательно" value={comment} onChange={(e) => setComment(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition bg-gray-50 focus:bg-white resize-none"
                rows={3}
              />
            </motion.div>
          </div>

          {/* Правая часть */}
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:w-80 shrink-0"
          >
            <div className="bg-white rounded-2xl p-6 border border-gray-100 sticky top-24">
              <h2 className="text-sm font-bold text-gray-900 uppercase tracking-wide mb-4">Ваш заказ</h2>

              {/* Товары */}
              <div className="flex flex-col gap-3 mb-4 max-h-48 overflow-y-auto">
                {orderItems.map(item => (
                  <div key={itemKey(item)} className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gray-100 rounded-lg shrink-0 overflow-hidden flex items-center justify-center">
                      {item.image ? (
                        <img src={item.image} alt={item.name} className="w-full h-full object-contain" />
                      ) : (
                        <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V7" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-700 font-medium line-clamp-1">{item.name}</p>
                      <p className="text-xs text-gray-400">{item.quantity} шт.</p>
                    </div>
                    <p className="text-xs font-bold text-gray-900 shrink-0">
                      {(Number(item.price) * item.quantity).toLocaleString()} ₽
                    </p>
                  </div>
                ))}
              </div>

              {/* Итого */}
              <div className="border-t border-gray-100 pt-4 mb-5 flex flex-col gap-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Товары ({orderItems.length})</span>
                  <span className="font-medium text-gray-800">{orderTotal.toLocaleString()} ₽</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Доставка</span>
                  <span className="font-medium text-emerald-600">
                    {deliveryMethod === 'pickup' ? 'Бесплатно' : 'от 299 ₽'}
                  </span>
                </div>
                <div className="flex justify-between text-base font-black pt-2 border-t border-gray-100">
                  <span className="text-gray-900">Итого</span>
                  <span className="text-emerald-600">{orderTotal.toLocaleString()} ₽</span>
                </div>
              </div>

              {/* Промокод/баллы - вход-подсказка (Ф9 решение 3.6). Логика - Ф27,
                  итог здесь не меняется; второй ввод не плодим. */}
              <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl px-3 py-2.5 mb-4">
                <svg className="w-4 h-4 shrink-0 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5a1.99 1.99 0 011.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.99 1.99 0 013 12V7a4 4 0 014-4z" />
                </svg>
                Промокод и баллы — на шаге оформления, скоро
              </div>

              {/* Согласие с офертой (Ф26) - со ссылками на документы */}
              <label className="flex items-start gap-2.5 cursor-pointer select-none mb-4">
                <input
                  type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-400 shrink-0"
                />
                <span className="text-xs text-gray-500 leading-relaxed">
                  Подтверждаю согласие с{' '}
                  <Link to="/legal/oferta" target="_blank" className="text-indigo-600 hover:underline">офертой</Link>
                  {' '}и{' '}
                  <Link to="/legal/privacy" target="_blank" className="text-indigo-600 hover:underline">политикой конфиденциальности</Link>
                </span>
              </label>

              <motion.button
                onClick={handleOrder}
                disabled={loading || orderItems.length === 0 || !agreed}
                className="w-full bg-[#111] text-white py-3.5 rounded-xl font-bold text-sm hover:bg-gray-800 transition disabled:opacity-50 flex items-center justify-center gap-2 mb-4"
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                {loading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : 'Подтвердить заказ'}
              </motion.button>

              <div className="flex flex-col gap-2">
                {GUARANTEES.map(g => (
                  <div key={g.label} className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="text-emerald-500">{g.icon}</span>
                    {g.label}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  )
}