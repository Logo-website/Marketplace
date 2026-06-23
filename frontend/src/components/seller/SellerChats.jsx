import ChatThreadList from '../chat/ChatThreadList'

// Вкладка «Чаты с покупателями» в кабинете продавца (Ф24, узел 2.9). Показывает
// диалоги, где пользователь - продавец (role=seller): входящие вопросы по товарам/
// заказам. Клик ведёт на экран диалога /chats/:id.
export default function SellerChats() {
  return (
    <ChatThreadList
      role="seller"
      emptyTitle="Пока нет сообщений от покупателей"
      emptySubtitle="Когда покупатель напишет вам о товаре или заказе, диалог появится здесь."
    />
  )
}
