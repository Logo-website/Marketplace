import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import api from '../../api'
import useAsyncData from '../../hooks/useAsyncData'
import Spinner from '../states/Spinner'
import ErrorState from '../states/ErrorState'
import { sizeMatch, GROUP_AXES } from '../../utils/sizeMatch'

// Размерная сетка - модалка из карточки (Ф5, узел 1.6). Три секции:
// таблица мерок, конвертация RU/EU/US/INTL, подбор размера по меркам тела.
// Мерки тела наружу НЕ уходят - подбор на клиенте (план Ф5 решение 5).
//
// Props:
//   productId - id товара (грузим его сетку через size-chart/);
//   onClose   - закрытие модалки;
//   prefill   - опц. мерки из профиля (Ф10): { chest, waist, hips, foot_cm }.
//               Если профиля нет - поля пустые, пользователь вводит руками.

const AXIS_LABEL = {
  chest: 'Обхват груди, см',
  waist: 'Обхват талии, см',
  hips: 'Обхват бёдер, см',
  foot_cm: 'Длина стопы, см',
}
// Короткие подписи для колонок таблицы мерок (узкие колонки на мобильном).
const AXIS_SHORT = {
  chest: 'Грудь',
  waist: 'Талия',
  hips: 'Бёдра',
  foot_cm: 'Стопа',
}
const AXIS_ORDER = ['chest', 'waist', 'hips', 'foot_cm']

export default function SizeGuideModal({ productId, onClose, prefill }) {
  const { data: chart, status, retry } = useAsyncData(
    (signal) => api.get(`/products/${productId}/size-chart/`, { signal }).then((r) => r.data),
    [productId]
  )

  // Закрытие по ESC + блокировка скролла фона, пока модалка открыта.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="w-full md:max-w-2xl bg-white rounded-t-2xl md:rounded-2xl max-h-[90vh] md:max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%', opacity: 0.5 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        {/* Шапка */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-black text-gray-900">Размерная сетка</h2>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-gray-100 transition text-gray-500"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Тело */}
        <div className="overflow-y-auto px-5 py-5 flex flex-col gap-7">
          {status === 'loading' && (
            <div className="flex justify-center py-12 text-gray-400">
              <Spinner className="w-8 h-8" />
            </div>
          )}

          {status === 'error' && (
            <ErrorState
              title="Не удалось загрузить таблицу"
              subtitle="Проверьте соединение и попробуйте снова."
              onRetry={retry}
            />
          )}

          {status === 'ready' && (!chart || !chart.group) && (
            <p className="text-center text-gray-400 py-10 text-sm">
              Для этого товара размерная сетка недоступна.
            </p>
          )}

          {status === 'ready' && chart?.group && (
            <>
              <MeasurementsTable chart={chart} />
              <ConversionTable chart={chart} />
              <SizeMatcher chart={chart} prefill={prefill} />
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// --- Секция 1: таблица мерок (колонки зависят от группы) ---
function MeasurementsTable({ chart }) {
  const axes = AXIS_ORDER.filter((a) => chart.measurements.some((r) => r[a] != null))
  return (
    <section>
      <h3 className="text-sm font-bold text-gray-900 mb-3">Таблица размеров</h3>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-gray-400 text-xs">
              <th className="text-left font-semibold py-2 pr-4">RU</th>
              {axes.map((a) => (
                <th key={a} className="text-left font-semibold py-2 pr-4 whitespace-nowrap">{AXIS_SHORT[a]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chart.measurements.map((row) => (
              <tr key={row.ru} className="border-t border-gray-100">
                <td className="py-2 pr-4 font-bold text-gray-900">{row.ru}</td>
                {axes.map((a) => (
                  <td key={a} className="py-2 pr-4 text-gray-600">{row[a] != null ? row[a] : '—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// --- Секция 2: конвертация RU/EU/US(/INTL) ---
function ConversionTable({ chart }) {
  const hasIntl = chart.conversion.some((r) => r.intl)
  return (
    <section>
      <h3 className="text-sm font-bold text-gray-900 mb-3">Конвертация размеров</h3>
      <div className="overflow-x-auto -mx-1 px-1">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-gray-400 text-xs">
              <th className="text-left font-semibold py-2 pr-4">RU</th>
              <th className="text-left font-semibold py-2 pr-4">EU</th>
              <th className="text-left font-semibold py-2 pr-4">US</th>
              {hasIntl && <th className="text-left font-semibold py-2 pr-4">INTL</th>}
            </tr>
          </thead>
          <tbody>
            {chart.conversion.map((row) => (
              <tr key={row.ru} className="border-t border-gray-100">
                <td className="py-2 pr-4 font-bold text-gray-900">{row.ru}</td>
                <td className="py-2 pr-4 text-gray-600">{row.eu || '—'}</td>
                <td className="py-2 pr-4 text-gray-600">{row.us || '—'}</td>
                {hasIntl && <td className="py-2 pr-4 text-gray-600">{row.intl || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

// --- Секция 3: подбор размера по меркам тела (на клиенте) ---
function SizeMatcher({ chart, prefill }) {
  const axes = GROUP_AXES[chart.group] || []
  const initial = () => {
    const o = {}
    for (const a of axes) o[a] = prefill?.[a] != null ? String(prefill[a]) : ''
    return o
  }
  const [values, setValues] = useState(initial)
  const [result, setResult] = useState(null)
  const [touched, setTouched] = useState(false)

  const onSubmit = (e) => {
    e.preventDefault()
    setTouched(true)
    const body = {}
    for (const a of axes) {
      const n = Number(values[a])
      if (Number.isFinite(n) && n > 0) body[a] = n
    }
    setResult(sizeMatch(body, chart))
  }

  return (
    <section>
      <h3 className="text-sm font-bold text-gray-900 mb-1">Подобрать размер</h3>
      <p className="text-xs text-gray-400 mb-3">
        Введите мерки тела в сантиметрах - подскажем размер. Данные остаются в браузере.
      </p>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {axes.map((a) => (
            <label key={a} className="flex flex-col gap-1">
              <span className="text-xs text-gray-500 font-medium">{AXIS_LABEL[a]}</span>
              <input
                type="number"
                inputMode="decimal"
                min="1"
                step="0.5"
                value={values[a]}
                onChange={(e) => setValues((v) => ({ ...v, [a]: e.target.value }))}
                placeholder="—"
                className="h-11 px-3 rounded-xl border-2 border-gray-200 text-sm focus:border-indigo-400 outline-none"
              />
            </label>
          ))}
        </div>
        <button
          type="submit"
          className="self-start px-5 py-2.5 rounded-xl bg-[#111] text-white text-sm font-bold hover:bg-gray-800 transition"
        >
          Подобрать размер
        </button>
      </form>

      {touched && result && (
        <div className="mt-4 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
          <p className="text-sm text-gray-700">
            Рекомендуем размер{' '}
            <span className="font-black text-emerald-700">RU {result.ru}</span>
            {result.conversion && (
              <span className="text-gray-500">
                {' '}({[
                  result.conversion.eu && `EU ${result.conversion.eu}`,
                  result.conversion.us && `US ${result.conversion.us}`,
                  result.conversion.intl,
                ].filter(Boolean).join(' / ')})
              </span>
            )}
          </p>
          {result.nearest && (
            <p className="text-xs text-amber-600 mt-1">
              Мерка за границами таблицы - показан ближайший размер.
            </p>
          )}
        </div>
      )}

      {touched && !result && (
        <p className="mt-4 text-xs text-red-500">
          Введите хотя бы одну корректную мерку (число больше нуля).
        </p>
      )}
    </section>
  )
}
