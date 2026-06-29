import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from '../store/toastStore'

// Раздел Помощь / FAQ (Ф24, узел 1.16). Статический контент (учебный скоуп, Q5),
// не CMS. Якоря (#returns/#payment/...) совпадают со ссылками бота поддержки.
// Юридические документы (оферта, 152-ФЗ) - forward в Ф26, тут заглушка.
const FAQ = [
  {
    id: 'returns',
    q: 'Как вернуть товар?',
    a: 'Оформите заявку в профиле -> «Возвраты» в течение 14 дней с даты доставки. ' +
      'Продавец рассмотрит заявку; при отказе можно открыть спор - его рассудит площадка.',
  },
  {
    id: 'payment',
    q: 'Какие способы оплаты доступны?',
    a: 'Мы принимаем банковские карты. Если деньги списались, а заказ не оформился, ' +
      'средства возвращаются автоматически в течение нескольких рабочих дней.',
  },
  {
    id: 'delivery',
    q: 'Сколько идёт доставка?',
    a: 'Сроки и способы доставки зависят от продавца и вашего города. Текущий статус ' +
      'заказа виден в профиле -> «Заказы».',
  },
  {
    id: 'sizes',
    q: 'Как подобрать размер?',
    a: 'На странице товара есть размерная сетка и подбор по вашим параметрам из профиля. ' +
      'Если сомневаетесь - напишите продавцу в чате прямо со страницы товара.',
  },
  {
    id: 'selling',
    q: 'Как стать продавцом?',
    a: 'Нажмите «Продавать» в шапке сайта и пройдите онбординг: данные магазина, ' +
      'юридический статус и реквизиты. После проверки вы сможете публиковать товары.',
  },
  {
    id: 'chat',
    q: 'Как связаться с продавцом или поддержкой?',
    a: 'Кнопка «Чат с продавцом» есть на странице каждого товара. Поддержку площадки ' +
      'можно открыть в разделе «Чаты» - бот ответит сразу, при необходимости подключит оператора.',
  },
]

export default function HelpPage() {
  const [open, setOpen] = useState(() => (typeof window !== 'undefined' ? window.location.hash.slice(1) : ''))

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="font-display text-3xl font-bold text-ink mb-2">Помощь и частые вопросы</h1>
      <p className="text-ink-faint mb-8">
        Не нашли ответ? Откройте чат с поддержкой - мы поможем.
      </p>

      <div className="space-y-3">
        {FAQ.map((item) => {
          const isOpen = open === item.id
          return (
            <div
              key={item.id}
              id={item.id}
              className="bg-card rounded-2xl border border-line overflow-hidden scroll-mt-24"
            >
              <button
                onClick={() => setOpen(isOpen ? '' : item.id)}
                className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
              >
                <span className="font-semibold text-ink">{item.q}</span>
                <span className={`text-ink-faint transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                  ▾
                </span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <p className="px-5 pb-4 text-ink-soft text-sm leading-relaxed">{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* Юр-документы - forward в Ф26 (оферта, политика 152-ФЗ), пока заглушка. */}
      <div className="mt-8 flex flex-wrap gap-4 text-sm text-ink-faint">
        <button onClick={() => toast('Юридические документы появятся в фазе Ф26')} className="hover:text-ink-soft underline">
          Публичная оферта
        </button>
        <button onClick={() => toast('Юридические документы появятся в фазе Ф26')} className="hover:text-ink-soft underline">
          Политика конфиденциальности
        </button>
        <Link to="/chats" className="hover:text-ink-soft underline ml-auto">
          Открыть чаты
        </Link>
      </div>
    </div>
  )
}
