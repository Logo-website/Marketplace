import { create } from 'zustand'
import api from '../api'
import { toast } from './toastStore'

// Стор чата (Ф24). Запись/чтение - через REST (Django); живой приём - через единое
// WS-соединение notificationStore, которое роутит событие chat.message сюда (мы не
// держим второй сокет). Бейдж непрочитанных - свой счётчик из /conversations/, не
// колокольчик (это разные домены).
const useChatStore = create((set, get) => ({
  conversations: [],
  activeId: null,
  messages: [],
  loadingList: false,
  loadingMessages: false,
  sending: false,
  listError: false,

  // Суммарный счётчик непрочитанных по всем диалогам (бейдж иконки чата).
  totalUnread: () =>
    get().conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0),

  fetchConversations: async () => {
    set({ loadingList: true, listError: false })
    try {
      const res = await api.get('/chat/conversations/')
      set({ conversations: res.data || [] })
    } catch {
      set({ listError: true })
    } finally {
      set({ loadingList: false })
    }
  },

  // Старт/получение диалога (идемпотентно на бэке). Возвращает id диалога или null.
  startConversation: async ({ kind, seller, product, order } = {}) => {
    try {
      const res = await api.post('/chat/conversations/', { kind, seller, product, order })
      const conv = res.data
      // Влить/обновить в список без дубля.
      set((state) => ({
        conversations: [conv, ...state.conversations.filter((c) => c.id !== conv.id)],
      }))
      return conv.id
    } catch {
      toast('Не удалось открыть диалог')
      return null
    }
  },

  fetchMessages: async (id) => {
    set({ loadingMessages: true })
    try {
      const res = await api.get(`/chat/conversations/${id}/messages/`)
      // Защита от гонки: пока летел запрос, пользователь мог переключить диалог -
      // не перетираем ленту нового диалога ответом старого.
      if (get().activeId === id) set({ messages: res.data || [] })
    } catch {
      if (get().activeId === id) set({ messages: [] })
    } finally {
      if (get().activeId === id) set({ loadingMessages: false })
    }
  },

  // Открыть диалог: загрузить ленту и отметить входящие прочитанными.
  openConversation: async (id) => {
    set({ activeId: id, messages: [] })
    await get().fetchMessages(id)
    await get().markRead(id)
  },

  closeConversation: () => set({ activeId: null, messages: [] }),

  sendMessage: async (id, body) => {
    const text = (body || '').trim()
    if (!text) return false
    set({ sending: true })
    try {
      const res = await api.post(`/chat/conversations/${id}/messages/`, { body: text })
      const added = [res.data.message]
      // Ответ бота поддержки приходит в том же ответе (синхронно).
      if (res.data.bot_message) added.push(res.data.bot_message)
      set((state) => ({ messages: [...state.messages, ...added] }))
      // Обновить список (превью/сортировка).
      get().fetchConversations()
      return true
    } catch (e) {
      toast(e.response?.status === 429 ? 'Слишком часто, подождите немного' : 'Сообщение не отправлено')
      return false
    } finally {
      set({ sending: false })
    }
  },

  markRead: async (id) => {
    try {
      await api.post(`/chat/conversations/${id}/read/`)
      // Локально обнулить счётчик этого диалога.
      set((state) => ({
        conversations: state.conversations.map((c) =>
          c.id === id ? { ...c, unread_count: 0 } : c
        ),
      }))
    } catch {
      /* счётчик восстановится на следующем fetchConversations */
    }
  },

  // Входящее WS-событие chat.message (роутит notificationStore). Только адресату.
  receiveWsMessage: (data) => {
    if (!data || data.conversation_id == null) return
    const { activeId } = get()
    // Список/бейдж всегда актуализируем.
    get().fetchConversations()
    if (activeId === data.conversation_id) {
      // Диалог открыт - подтянуть полную ленту и сразу пометить прочитанным.
      get().fetchMessages(activeId).then(() => get().markRead(activeId))
    } else {
      toast('Новое сообщение в чате')
    }
  },

  // Сброс при логауте (по образцу notificationStore.disconnect).
  reset: () => set({ conversations: [], activeId: null, messages: [] }),
}))

export default useChatStore
