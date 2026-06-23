import { create } from 'zustand'
import api from '../api'
import useChatStore from './chatStore'

// WS-адрес через env (Vite), не хардкод. По умолчанию - локальный node-сервис.
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000'
const RECONNECT_DELAY_MS = 3000

let socket = null
let reconnectTimer = null
let intentionalClose = false
let toastCounter = 0

// Ф25: бэкенд шлёт уже готовое уведомление (title/body/link) через топик
// user.notification - человекочитаемый текст собирать на клиенте больше не нужно.
const useNotificationStore = create((set, get) => ({
  notifications: [], // эфемерные тосты (живой пуш)
  feed: [],          // персистентная лента колокольчика
  unread: 0,         // счётчик непрочитанных
  connected: false,

  connect: () => {
    const token = localStorage.getItem('access_token')
    if (!token) return
    // Уже открыт или открывается - не плодим соединения (защита от дублей).
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
      return
    }

    intentionalClose = false
    socket = new WebSocket(WS_URL)

    socket.onopen = () => {
      // Токен шлём в первом сообщении, не в URL - чтобы не утёк в логи сервера.
      socket.send(JSON.stringify({ type: 'auth', token }))
    }

    socket.onmessage = (event) => {
      let msg
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }
      if (msg.type === 'auth_ok') {
        set({ connected: true })
        // На свежем соединении подтянуть актуальный счётчик непрочитанных.
        get().fetchUnread()
        return
      }
      if (msg.type === 'user.notification') {
        const n = msg.data
        if (!n || n.id == null) return
        const toast = { id: ++toastCounter, text: n.title, link: n.link }
        set((state) => ({
          // В ленту - сверху, без дубля по id (на случай повторной доставки).
          feed: [n, ...state.feed.filter((f) => f.id !== n.id)],
          unread: state.unread + (n.is_read ? 0 : 1),
          notifications: [...state.notifications, toast],
        }))
        // Авто-скрытие тоста через 6 секунд.
        setTimeout(() => get().dismiss(toast.id), 6000)
        return
      }
      // Чат (Ф24) - отдельный домен: не в ленту-колокольчик, а в chatStore.
      if (msg.type === 'chat.message') {
        useChatStore.getState().receiveWsMessage(msg.data)
      }
    }

    socket.onclose = () => {
      set({ connected: false })
      socket = null
      // Переподключение при разрыве, если выход не был намеренным (logout).
      if (!intentionalClose && localStorage.getItem('access_token')) {
        reconnectTimer = setTimeout(() => get().connect(), RECONNECT_DELAY_MS)
      }
    }

    socket.onerror = () => {
      // onclose отработает следом - реконнект там.
      socket && socket.close()
    }
  },

  disconnect: () => {
    intentionalClose = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (socket) {
      socket.close()
      socket = null
    }
    set({ connected: false, notifications: [], feed: [], unread: 0 })
    // Чат живёт на том же соединении - чистим его стор тоже (логаут).
    useChatStore.getState().reset()
  },

  dismiss: (id) => {
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }))
  },

  // Счётчик непрочитанных (бейдж колокольчика). Тихо игнорируем ошибку - бейдж
  // не критичен, не роняем UI.
  fetchUnread: async () => {
    try {
      const res = await api.get('/notifications/unread-count/')
      set({ unread: res.data?.count ?? 0 })
    } catch {
      /* счётчик не критичен */
    }
  },

  // Лента (дропдаун колокольчика). Пагинированный ответ DRF -> results.
  fetchFeed: async () => {
    try {
      const res = await api.get('/notifications/')
      const items = Array.isArray(res.data) ? res.data : res.data?.results || []
      set({ feed: items })
    } catch {
      /* лента подтянется при следующем открытии */
    }
  },

  markRead: async (id) => {
    // Оптимистично гасим непрочитанность, затем подтверждаем на сервере.
    set((state) => ({
      feed: state.feed.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
      unread: Math.max(0, state.unread - (state.feed.find((n) => n.id === id && !n.is_read) ? 1 : 0)),
    }))
    try {
      await api.post(`/notifications/${id}/read/`)
    } catch {
      /* при ошибке счётчик восстановится на следующем fetchUnread */
    }
  },

  markAllRead: async () => {
    set((state) => ({ feed: state.feed.map((n) => ({ ...n, is_read: true })), unread: 0 }))
    try {
      await api.post('/notifications/read-all/')
    } catch {
      /* no-op */
    }
  },
}))

export default useNotificationStore
