import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import api from '../api'
import useAsyncData from '../hooks/useAsyncData'
import { Skeleton } from '../components/states/Skeleton'
import ErrorState from '../components/states/ErrorState'

// Страница юридического документа (Ф26, узел 1.20). Одна страница на все 5
// документов - рендер по slug из /legal/:slug. Контент управляемый (БД+админка),
// грузится из публичного API. Состояния загрузки/ошибки/404 - из Ф0.
//
// Безопасность (§8): body рендерим КАК ТЕКСТ (whitespace-pre-line), без
// dangerouslySetInnerHTML - даже ошибочный/вредный ввод в админке не станет XSS.
export default function LegalPage() {
  const { slug } = useParams()

  const { data, status, error, retry } = useAsyncData(
    (signal) => api.get(`/legal/documents/${slug}/`, { signal }).then((r) => r.data),
    [slug],
  )

  if (status === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <Skeleton className="h-8 w-2/3 rounded-lg mb-4" />
        <Skeleton className="h-4 w-1/3 rounded mb-8" />
        <div className="flex flex-col gap-3">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-4 w-full rounded" />)}
        </div>
      </div>
    )
  }

  if (status === 'error') {
    // 404 (неизвестный slug / снятый с публикации документ) - отдельный честный
    // экран «не найдено», а не общий «что-то пошло не так».
    if (error?.response?.status === 404) {
      return (
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl">📄</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Документ не найден</h1>
          <p className="text-gray-400 text-sm mb-6">Такого документа нет или он снят с публикации.</p>
          <Link to="/" className="inline-block px-6 py-2.5 rounded-xl bg-[#111] text-white text-sm font-semibold hover:bg-gray-800 transition">
            На главную
          </Link>
        </div>
      )
    }
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <ErrorState onRetry={retry} />
      </div>
    )
  }

  const effective = data.effective_date
    ? new Date(data.effective_date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-3xl mx-auto px-4 py-10"
    >
      <h1 className="text-3xl font-bold text-gray-900 mb-2">{data.title}</h1>
      <p className="text-sm text-gray-400 mb-8">
        Редакция {data.version}
        {effective ? ` · действует с ${effective}` : ''}
      </p>

      <div className="bg-white rounded-2xl border border-gray-100 p-6 sm:p-8">
        {data.body ? (
          <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">{data.body}</p>
        ) : (
          <p className="text-gray-400 text-sm">Текст документа готовится.</p>
        )}
      </div>
    </motion.div>
  )
}
