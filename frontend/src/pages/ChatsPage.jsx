import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import useChatStore from '../store/chatStore'
import { toast } from '../store/toastStore'
import EmptyState from '../components/states/EmptyState'
import ErrorState from '../components/states/ErrorState'
import Icon from '../components/ui/Icon'

// Экран чатов (Ф24, узлы 1.13-«чаты» и 2.9). Один экран на покупателя и продавца:
// список диалогов + окно переписки. Адаптивно (4.2): на мобиле виден либо список,
// либо открытый диалог. Запись/чтение - REST, живой приём - WS через chatStore.
export default function ChatsPage() {
  const { id } = useParams()
  const activeId = id ? Number(id) : null
  const navigate = useNavigate()
  const {
    conversations, messages, loadingList, loadingMessages, listError,
    fetchConversations, openConversation, closeConversation,
  } = useChatStore()

  useEffect(() => {
    fetchConversations()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (activeId) openConversation(activeId)
    else closeConversation()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  const startSupport = async () => {
    const convId = await useChatStore.getState().startConversation({ kind: 'support' })
    if (convId) navigate(`/chats/${convId}`)
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="font-display text-2xl font-bold text-ink">Чаты</h1>
        <button
          onClick={startSupport}
          className="text-sm font-semibold text-accent hover:underline"
        >
          Написать в поддержку
        </button>
      </div>

      <div className="bg-card rounded-2xl border border-line overflow-hidden grid lg:grid-cols-[320px_1fr] min-h-[60vh]">
        {/* Список диалогов: на мобиле скрыт, когда открыт конкретный диалог. */}
        <aside className={`border-r border-line ${activeId ? 'hidden lg:block' : 'block'}`}>
          <ConversationList
            items={conversations}
            loading={loadingList}
            error={listError}
            activeId={activeId}
            onRetry={fetchConversations}
            onSelect={(cid) => navigate(`/chats/${cid}`)}
          />
        </aside>

        {/* Окно переписки: на мобиле скрыто, пока не выбран диалог. */}
        <section className={`${activeId ? 'flex' : 'hidden lg:flex'} flex-col`}>
          {activeId ? (
            <ChatWindow
              key={activeId}
              conversationId={activeId}
              conversation={conversations.find((c) => c.id === activeId)}
              messages={messages}
              loading={loadingMessages}
              onBack={() => navigate('/chats')}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center p-10 text-ink-faint text-sm">
              Выберите диалог слева
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function ConversationList({ items, loading, error, activeId, onSelect, onRetry }) {
  if (loading && items.length === 0) {
    return (
      <div className="p-3 flex flex-col gap-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-16 rounded-xl skeleton" />
        ))}
      </div>
    )
  }
  if (error && items.length === 0) {
    return <ErrorState title="Не удалось загрузить диалоги" onRetry={onRetry} />
  }
  if (items.length === 0) {
    return (
      <EmptyState
        className="border-0"
        icon={<Icon name="chat" className="w-7 h-7 text-ink-faint" />}
        title="Пока нет диалогов"
        subtitle="Напишите продавцу со страницы товара или обратитесь в поддержку."
      />
    )
  }
  return (
    <ul className="divide-y divide-line max-h-[70vh] overflow-y-auto">
      {items.map((c) => (
        <li key={c.id}>
          <button
            onClick={() => onSelect(c.id)}
            className={`w-full text-left px-4 py-3 hover:bg-surface transition ${
              activeId === c.id ? 'bg-surface' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-sm text-ink truncate">{c.title}</span>
              {c.unread_count > 0 && (
                <span className="shrink-0 bg-accent text-white text-xs font-bold rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                  {c.unread_count}
                </span>
              )}
            </div>
            {c.product_title && (
              <p className="text-xs text-ink-faint truncate mt-0.5">{c.product_title}</p>
            )}
            {c.last_message && (
              <p className="text-xs text-ink-faint truncate mt-0.5">
                {c.last_message.is_from_bot ? 'Бот: ' : ''}{c.last_message.body}
              </p>
            )}
          </button>
        </li>
      ))}
    </ul>
  )
}

function ChatWindow({ conversationId, conversation, messages, loading, onBack }) {
  const [text, setText] = useState('')
  const { sending } = useChatStore()
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const submit = async (e) => {
    e.preventDefault()
    const ok = await useChatStore.getState().sendMessage(conversationId, text)
    if (ok) setText('')
  }

  return (
    <div className="flex flex-col flex-1 min-h-[60vh] max-h-[78vh]">
      {/* Шапка диалога */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-line">
        <button onClick={onBack} className="lg:hidden text-ink-faint" aria-label="Назад">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.8} viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-ink truncate">
            {conversation?.title || 'Диалог'}
          </p>
          {conversation?.product_title && (
            <p className="text-xs text-ink-faint truncate">{conversation.product_title}</p>
          )}
        </div>
        {/* Жалоба на переписку - forward в Ф18 (модерация UGC), честная заглушка. */}
        <button
          onClick={() => toast('Жалобы на сообщения появятся в фазе Ф18')}
          className="text-xs text-ink-faint hover:text-ink-soft"
        >
          Пожаловаться
        </button>
      </header>

      {/* Лента сообщений */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2 bg-surface/40">
        {loading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`h-10 w-2/3 rounded-2xl skeleton ${i % 2 ? 'ml-auto' : ''}`} />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <p className="text-center text-ink-faint text-sm py-10">
            Сообщений пока нет. Напишите первое.
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Поле ввода */}
      <form onSubmit={submit} className="flex items-end gap-2 p-3 border-t border-line">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) submit(e)
          }}
          rows={1}
          maxLength={4000}
          placeholder="Введите сообщение..."
          className="flex-1 resize-none rounded-xl border border-line-strong px-3 py-2 text-sm focus:outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="px-4 py-2 rounded-xl bg-ink text-white text-sm font-semibold disabled:opacity-40 hover:bg-ink/90 transition"
        >
          Отправить
        </button>
      </form>
    </div>
  )
}

function MessageBubble({ message }) {
  const mine = message.is_mine
  const bot = message.is_from_bot
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-sm ${
          mine
            ? 'bg-ink text-white'
            : bot
            ? 'bg-accent-soft text-ink border border-accent/30'
            : 'bg-card text-ink border border-line'
        }`}
      >
        {bot && <p className="text-[10px] font-bold text-accent mb-0.5">Поддержка</p>}
        {/* Тело - JSX-текст: React экранирует, XSS не проходит (§8). */}
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
      </div>
    </motion.div>
  )
}
