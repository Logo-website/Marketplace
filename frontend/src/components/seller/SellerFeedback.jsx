import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import api from '../../api'
import { toast } from '../../store/toastStore'
import ErrorState from '../states/ErrorState'

// Рабочее место обратной связи продавца (Ф15, узел 2.8): отзывы и вопросы по
// своим товарам в одном месте + ответы на них. Отзыв -> POST /reviews/<id>/reply/
// (ответ виден на карточке Ф4). Вопрос -> существующий answer-эндпоинт Ф6
// (ответ помечается бейджем «Продавец» в Q&A карточки). Состояния по Ф0:
// skeleton/пусто/ErrorState, без alert().

const SUB_TABS = [
  { id: 'reviews', label: 'Отзывы' },
  { id: 'questions', label: 'Вопросы' },
]

function Stars({ value }) {
  return (
    <span className="text-star text-sm">
      {[1, 2, 3, 4, 5].map((s) => (
        <span key={s} className={value >= s ? 'text-star' : 'text-line-strong'}>★</span>
      ))}
    </span>
  )
}

function ProductLink({ id, name }) {
  return (
    <Link
      to={`/products/${id}`}
      className="text-xs font-semibold text-accent hover:underline"
    >
      {name}
    </Link>
  )
}

function ReplyForm({ initial = '', placeholder, busy, onSubmit, onCancel }) {
  const [text, setText] = useState(initial)
  return (
    <div className="mt-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        rows={3}
        className="w-full border border-line-strong rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft transition resize-none bg-card"
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={() => onSubmit(text)}
          disabled={busy || !text.trim()}
          className="bg-ink text-white px-4 py-2 rounded-xl font-semibold text-sm hover:bg-ink/90 transition disabled:opacity-50"
        >
          {busy ? 'Отправляем…' : 'Отправить'}
        </button>
        {onCancel && (
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl font-semibold text-sm text-ink-faint hover:text-ink transition"
          >
            Отмена
          </button>
        )}
      </div>
    </div>
  )
}

function ReviewCard({ review, busy, onReply }) {
  const [editing, setEditing] = useState(false)
  const hasReply = !!review.seller_reply
  return (
    <div className="bg-card rounded-2xl border border-line p-5">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div className="flex items-center gap-2.5">
          <Stars value={review.rating} />
          <span className="font-semibold text-sm text-ink">{review.username}</span>
        </div>
        <ProductLink id={review.product_id} name={review.product_name} />
      </div>
      <p className="text-sm text-ink-soft leading-relaxed">{review.text}</p>

      {hasReply && !editing && (
        <div className="mt-3 bg-surface border-l-2 border-ink rounded-r-xl p-3.5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold text-ink">Ваш ответ</span>
            <button
              onClick={() => setEditing(true)}
              className="text-xs text-accent font-semibold hover:underline"
            >
              Редактировать
            </button>
          </div>
          <p className="text-sm text-ink-soft leading-relaxed">{review.seller_reply}</p>
        </div>
      )}

      {(!hasReply || editing) && (
        <ReplyForm
          initial={review.seller_reply}
          placeholder="Ответьте покупателю — ответ появится на карточке товара"
          busy={busy}
          onSubmit={(text) => onReply(review, text, () => setEditing(false))}
          onCancel={editing ? () => setEditing(false) : null}
        />
      )}
    </div>
  )
}

function QuestionCard({ question, busy, onAnswer }) {
  const [answering, setAnswering] = useState(false)
  const sellerAnswered = (question.answers || []).some((a) => a.is_seller_answer)
  return (
    <div className="bg-card rounded-2xl border border-line p-5">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="font-semibold text-sm text-ink">{question.username}</span>
        <ProductLink id={question.product_id} name={question.product_name} />
      </div>
      <p className="text-sm text-ink-soft leading-relaxed">{question.text}</p>

      {(question.answers || []).length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {question.answers.map((a) => (
            <div key={a.id} className="bg-surface rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-bold text-ink">{a.username}</span>
                {a.is_seller_answer && (
                  <span className="bg-ink text-white text-[10px] font-bold px-1.5 py-0.5 rounded">Продавец</span>
                )}
              </div>
              <p className="text-sm text-ink-soft leading-relaxed">{a.text}</p>
            </div>
          ))}
        </div>
      )}

      {!answering ? (
        <button
          onClick={() => setAnswering(true)}
          className="mt-3 text-sm text-accent font-semibold hover:underline"
        >
          {sellerAnswered ? 'Добавить ответ' : 'Ответить'}
        </button>
      ) : (
        <ReplyForm
          placeholder="Ваш ответ появится в разделе «Вопросы» на карточке товара"
          busy={busy}
          onSubmit={(text) => onAnswer(question, text, () => setAnswering(false))}
          onCancel={() => setAnswering(false)}
        />
      )}
    </div>
  )
}

export default function SellerFeedback() {
  const [tab, setTab] = useState('reviews')
  const [onlyUnanswered, setOnlyUnanswered] = useState(false)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState(false)
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    fetchItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, onlyUnanswered])

  async function fetchItems() {
    setLoading(true)
    setListError(false)
    try {
      const params = onlyUnanswered ? { answered: 'false' } : {}
      const url = tab === 'reviews' ? '/products/my/reviews/' : '/products/my/questions/'
      const res = await api.get(url, { params })
      setItems(res.data.results ?? res.data)
    } catch {
      setListError(true)
    } finally {
      setLoading(false)
    }
  }

  // Ответ на отзыв: создать/перезаписать (POST идемпотентен, план 4.4).
  const handleReply = async (review, text, done) => {
    setBusyId(`r${review.id}`)
    try {
      await api.post(`/products/reviews/${review.id}/reply/`, { text })
      toast.success('Ответ опубликован')
      done?.()
      await fetchItems()
    } catch (err) {
      toast.error(err.response?.data?.text?.[0] || 'Не удалось отправить ответ')
    } finally {
      setBusyId(null)
    }
  }

  // Ответ на вопрос: существующий answer-эндпоинт Ф6 (своего write нет, план 4.2).
  const handleAnswer = async (question, text, done) => {
    setBusyId(`q${question.id}`)
    try {
      await api.post(`/products/${question.product_id}/questions/${question.id}/answers/`, { text })
      toast.success('Ответ опубликован')
      done?.()
      await fetchItems()
    } catch (err) {
      toast.error(err.response?.data?.text?.[0] || 'Не удалось отправить ответ')
    } finally {
      setBusyId(null)
    }
  }

  const emptyText = tab === 'reviews'
    ? (onlyUnanswered ? 'Нет отзывов без ответа' : 'Отзывов по вашим товарам пока нет')
    : (onlyUnanswered ? 'Нет вопросов без ответа' : 'Вопросов по вашим товарам пока нет')

  return (
    <motion.div key="feedback" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Под-табы и фильтр */}
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex items-center gap-1">
          {SUB_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
                tab === t.id ? 'bg-ink text-white shadow-sm' : 'bg-card text-ink-faint hover:text-ink border border-line'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-soft cursor-pointer select-none">
          <input
            type="checkbox"
            checked={onlyUnanswered}
            onChange={(e) => setOnlyUnanswered(e.target.checked)}
            className="rounded border-line-strong"
          />
          Только без ответа
        </label>
      </div>

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="bg-card rounded-2xl h-24 skeleton" />)}
        </div>
      ) : listError ? (
        <ErrorState
          title={tab === 'reviews' ? 'Не удалось загрузить отзывы' : 'Не удалось загрузить вопросы'}
          onRetry={fetchItems}
        />
      ) : items.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-2xl border border-line">
          <p className="text-ink-faint">{emptyText}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {tab === 'reviews'
            ? items.map((r) => (
                <ReviewCard key={r.id} review={r} busy={busyId === `r${r.id}`} onReply={handleReply} />
              ))
            : items.map((q) => (
                <QuestionCard key={q.id} question={q} busy={busyId === `q${q.id}`} onAnswer={handleAnswer} />
              ))}
        </div>
      )}
    </motion.div>
  )
}
