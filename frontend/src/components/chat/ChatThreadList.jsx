import { Link } from 'react-router-dom'
import api from '../../api'
import useAsyncData from '../../hooks/useAsyncData'
import EmptyState from '../states/EmptyState'
import ErrorState from '../states/ErrorState'

// Переиспользуемый список диалогов для встраивания во вкладки (профиль покупателя,
// кабинет продавца). Грузит /chat/conversations/?role=... сам (не трогает глобальный
// chatStore экрана /chats), рендерит ссылки на полноценный экран диалога /chats/:id.
//
// Props:
//   role        - 'buyer' | 'seller' (фильтр на бэке)
//   emptyTitle  - заголовок пустого состояния
//   emptySubtitle
export default function ChatThreadList({ role, emptyTitle, emptySubtitle }) {
  const query = useAsyncData(
    (signal) =>
      api
        .get('/chat/conversations/', { params: role ? { role } : {}, signal })
        .then((r) => r.data || []),
    [role]
  )

  if (query.status === 'loading') {
    return (
      <div className="flex flex-col gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-16 rounded-2xl skeleton" />
        ))}
      </div>
    )
  }
  if (query.status === 'error') {
    return <ErrorState title="Не удалось загрузить диалоги" onRetry={query.retry} />
  }
  const items = query.data || []
  if (items.length === 0) {
    return <EmptyState icon="💬" title={emptyTitle} subtitle={emptySubtitle} />
  }

  return (
    <ul className="space-y-2">
      {items.map((c) => (
        <li key={c.id}>
          <Link
            to={`/chats/${c.id}`}
            className="block bg-card rounded-2xl border border-line px-4 py-3 hover:border-line-strong transition"
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
                {c.last_message.is_from_bot ? '🤖 ' : ''}{c.last_message.body}
              </p>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}
