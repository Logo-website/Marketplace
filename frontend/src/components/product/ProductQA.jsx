import { useState } from 'react'
import { motion } from 'framer-motion'
import api from '../../api'
import useAsyncData from '../../hooks/useAsyncData'
import ErrorState from '../states/ErrorState'

// Секция «Вопросы о товаре» (Ф6, узел 1.7). Отдельная от отзывов публичная
// ветка «вопрос -> ответы»: задать вопрос можно БЕЗ покупки (инструмент до
// покупки), отвечает любой авторизованный, полезность ответа - лайки.
// Сортировку ответов по полезности даёт сервер; после лайка пересортируем
// локально (-helpful_count, created_at - тот же тай-брейк, что в Answer.Meta).

function sortAnswers(answers) {
  return [...answers].sort(
    (a, b) =>
      b.helpful_count - a.helpful_count ||
      new Date(a.created_at) - new Date(b.created_at)
  )
}

function fmtDate(value) {
  return value ? new Date(value).toLocaleDateString('ru-RU') : ''
}

function Avatar({ name }) {
  return (
    <div className="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-xs font-bold text-ink-soft shrink-0">
      {name?.[0]?.toUpperCase()}
    </div>
  )
}

export default function ProductQA({ productId, isAuthenticated, onLoginRequired, onReport }) {
  const { data, status, retry, setData } = useAsyncData(
    (signal) =>
      api.get(`/products/${productId}/questions/`, { signal }).then((r) => r.data),
    [productId]
  )
  const questions = data?.results || []
  const total = typeof data?.count === 'number' ? data.count : questions.length

  // Форма вопроса
  const [newQ, setNewQ] = useState('')
  const [qSubmitting, setQSubmitting] = useState(false)
  const [qError, setQError] = useState('')

  // Ответы: текст по id вопроса, какая форма открыта
  const [answerText, setAnswerText] = useState({})
  const [answeringId, setAnsweringId] = useState(null)
  const [aSubmitting, setASubmitting] = useState(false)
  const [aError, setAError] = useState('')

  // Голосование: id ответа в процессе запроса (блокирует двойной клик)
  const [votingId, setVotingId] = useState(null)

  const submitQuestion = async () => {
    if (!newQ.trim()) {
      setQError('Введите вопрос')
      return
    }
    setQSubmitting(true)
    setQError('')
    try {
      await api.post(`/products/${productId}/questions/`, { text: newQ })
      setNewQ('')
      retry()
    } catch (err) {
      setQError(err.response?.data?.text?.[0] || 'Не удалось отправить вопрос')
    } finally {
      setQSubmitting(false)
    }
  }

  const submitAnswer = async (qid) => {
    const text = (answerText[qid] || '').trim()
    if (!text) {
      setAError('Введите ответ')
      return
    }
    setASubmitting(true)
    setAError('')
    try {
      await api.post(`/products/${productId}/questions/${qid}/answers/`, { text })
      setAnswerText((m) => ({ ...m, [qid]: '' }))
      setAnsweringId(null)
      retry()
    } catch (err) {
      setAError(err.response?.data?.text?.[0] || 'Не удалось отправить ответ')
    } finally {
      setASubmitting(false)
    }
  }

  const toggleHelpful = async (qid, aid) => {
    if (!isAuthenticated) {
      onLoginRequired()
      return
    }
    if (votingId) return // запрос в процессе - не задваиваем
    setVotingId(aid)
    try {
      const res = await api.post(`/products/answers/${aid}/helpful/`)
      // Локальная пересортировка по свежему счётчику с сервера.
      setData((prev) => {
        if (!prev?.results) return prev
        const results = prev.results.map((q) => {
          if (q.id !== qid) return q
          const answers = sortAnswers(
            q.answers.map((a) =>
              a.id === aid
                ? {
                    ...a,
                    helpful_count: res.data.helpful_count,
                    liked_by_me: res.data.liked_by_me,
                  }
                : a
            )
          )
          return { ...q, answers }
        })
        return { ...prev, results }
      })
    } catch {
      // Тихо: при ошибке счётчик не меняется, кнопка разблокируется.
    } finally {
      setVotingId(null)
    }
  }

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="font-display text-xl font-bold text-ink">Вопросы о товаре</h2>
        {total > 0 && (
          <span className="bg-surface text-ink-soft text-xs font-bold px-2.5 py-1 rounded-lg">
            {total}
          </span>
        )}
      </div>

      {/* Форма вопроса (авторизованным) / подсказка гостю */}
      {isAuthenticated ? (
        <div className="bg-surface rounded-xl p-5 mb-6 border border-line">
          <p className="text-sm font-semibold text-ink mb-3">Задать вопрос</p>
          <textarea
            value={newQ}
            onChange={(e) => setNewQ(e.target.value)}
            placeholder="Спросите о товаре — продавец или другие покупатели ответят..."
            className="w-full border border-line rounded-xl px-4 py-3 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong transition resize-none mb-3 bg-card"
            rows={3}
          />
          {qError && <p className="text-danger text-xs mb-2">{qError}</p>}
          <motion.button
            onClick={submitQuestion}
            disabled={qSubmitting}
            className="bg-ink text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-ink/90 transition disabled:opacity-50"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {qSubmitting ? 'Отправляем...' : 'Спросить'}
          </motion.button>
        </div>
      ) : (
        <div className="bg-surface rounded-xl p-5 mb-6 border border-line flex items-center justify-between">
          <p className="text-ink-soft text-sm">Войдите, чтобы задать вопрос</p>
          <button
            onClick={onLoginRequired}
            className="text-sm text-accent font-semibold hover:underline shrink-0 ml-4"
          >
            Войти →
          </button>
        </div>
      )}

      {/* Состояния загрузки / ошибки / пусто / список */}
      {status === 'loading' ? (
        <div className="flex flex-col gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 bg-surface rounded-xl animate-pulse" />
          ))}
        </div>
      ) : status === 'error' ? (
        <ErrorState
          title="Не удалось загрузить вопросы"
          subtitle="Проверьте соединение и попробуйте снова."
          onRetry={retry}
          className="border-0 py-12"
        />
      ) : questions.length === 0 ? (
        <p className="text-ink-faint text-sm text-center py-8">
          Вопросов пока нет — задайте первым!
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {questions.map((q, i) => (
            <motion.div
              key={q.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.04, 0.3) }}
              className="py-5 first:pt-0 last:pb-0"
            >
              {/* Вопрос */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2.5">
                  <Avatar name={q.username} />
                  <span className="font-semibold text-sm text-ink">{q.username}</span>
                </div>
                <span className="text-xs text-ink-faint">{fmtDate(q.created_at)}</span>
              </div>
              <p className="text-sm text-ink font-medium leading-relaxed ml-10 mb-1">
                {q.text}
              </p>
              {/* Пожаловаться на вопрос (Ф18) */}
              {onReport && (
                <button
                  onClick={() => onReport({ type: 'question', id: q.id, label: 'вопрос' })}
                  className="ml-10 mb-3 text-xs text-ink-faint hover:text-danger transition"
                >
                  Пожаловаться
                </button>
              )}

              {/* Ответы */}
              {q.answers?.length > 0 && (
                <div className="ml-10 flex flex-col gap-3 mb-3">
                  {q.answers.map((a) => (
                    <div key={a.id} className="bg-surface rounded-xl p-3.5 border border-line">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-ink-soft">{a.username}</span>
                          {a.is_seller_answer && (
                            <span className="bg-accent-soft text-accent text-[10px] font-bold px-2 py-0.5 rounded-md">
                              Продавец
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-ink-faint">{fmtDate(a.created_at)}</span>
                      </div>
                      <p className="text-sm text-ink-soft leading-relaxed mb-2">{a.text}</p>
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleHelpful(q.id, a.id)}
                          disabled={votingId === a.id}
                          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition disabled:opacity-50 ${
                            a.liked_by_me
                              ? 'bg-accent-soft text-accent border-accent/30'
                              : 'bg-card text-ink-soft border-line hover:border-line-strong'
                          }`}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.633 10.5c.806 0 1.533-.446 2.031-1.08a9.041 9.041 0 012.861-2.4c.723-.384 1.35-.956 1.653-1.715a4.498 4.498 0 00.322-1.672V3a.6.6 0 01.6-.6 1.894 1.894 0 011.895 1.895c0 .947-.196 1.85-.55 2.668-.2.466.128.967.635.967h3.443c1.146 0 2.058 1.026 1.749 2.131a45.6 45.6 0 01-1.83 5.227c-.529 1.226-1.74 2.012-3.072 2.012H8.831M6.633 10.5l-.633-.5m.633.5v8.25m0-8.25H4.5a1.5 1.5 0 00-1.5 1.5v5.25a1.5 1.5 0 001.5 1.5h2.133" />
                          </svg>
                          Полезно{a.helpful_count > 0 ? ` (${a.helpful_count})` : ''}
                        </button>
                        {/* Пожаловаться на ответ (Ф18) */}
                        {onReport && (
                          <button
                            onClick={() => onReport({ type: 'answer', id: a.id, label: 'ответ' })}
                            className="text-xs text-ink-faint hover:text-danger transition"
                          >
                            Пожаловаться
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Ответить (авторизованным) */}
              {isAuthenticated &&
                (answeringId === q.id ? (
                  <div className="ml-10">
                    <textarea
                      value={answerText[q.id] || ''}
                      onChange={(e) =>
                        setAnswerText((m) => ({ ...m, [q.id]: e.target.value }))
                      }
                      placeholder="Ваш ответ..."
                      className="w-full border border-line rounded-xl px-4 py-2.5 text-sm text-ink placeholder:text-ink-faint focus:border-line-strong transition resize-none mb-2 bg-card"
                      rows={2}
                    />
                    {aError && <p className="text-danger text-xs mb-2">{aError}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={() => submitAnswer(q.id)}
                        disabled={aSubmitting}
                        className="bg-ink text-white px-4 py-1.5 rounded-lg font-semibold text-xs hover:bg-ink/90 transition disabled:opacity-50"
                      >
                        {aSubmitting ? 'Отправляем...' : 'Ответить'}
                      </button>
                      <button
                        onClick={() => {
                          setAnsweringId(null)
                          setAError('')
                        }}
                        className="text-ink-soft px-3 py-1.5 rounded-lg font-semibold text-xs hover:bg-surface transition"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      setAnsweringId(q.id)
                      setAError('')
                    }}
                    className="ml-10 text-xs text-accent font-semibold hover:underline"
                  >
                    Ответить
                  </button>
                ))}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}
