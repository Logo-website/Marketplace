import ChatThreadList from '../chat/ChatThreadList'

// Вкладка «Чаты» в кабинете покупателя (Ф24, узел 1.13). Показывает диалоги, где
// пользователь - инициатор (role=buyer): переписка с продавцами и поддержкой.
// Клик ведёт на полноценный экран /chats/:id.
export default function ChatsTab() {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Чаты</h2>
      <ChatThreadList
        role="buyer"
        emptyTitle="Пока нет диалогов"
        emptySubtitle="Напишите продавцу со страницы товара или обратитесь в поддержку площадки."
      />
    </div>
  )
}
