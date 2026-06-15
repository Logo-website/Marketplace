import { create } from 'zustand'

// WS-адрес через env (Vite), не хардкод. По умолчанию - локальный node-сервис.
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000'
const RECONNECT_DELAY_MS = 3000

let socket = null
let reconnectTimer = null
let intentionalClose = false
let idCounter = 0

// Человекочитаемый текст уведомления из события заказа.
function describe(type, data) {
  if (type === 'order.created') {
    return `Заказ #${data.order_id} оформлен`
  }
  if (type === 'order.status_changed') {
    const labels = {
      pending: 'ожидает',
      paid: 'оплачен',
      shipped: 'отправлен',
      delivered: 'доставлен',
      cancelled: 'отменён',
    }
    const status = labels[data.status] || data.status
    return `Заказ #${data.order_id}: ${status}`
  }
  return 'Новое уведомление'
}

const useNotificationStore = create((set, get) => ({
  notifications: [],
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
        return
      }
      if (msg.type === 'order.created' || msg.type === 'order.status_changed') {
        const note = { id: ++idCounter, text: describe(msg.type, msg.data) }
        set((state) => ({ notifications: [...state.notifications, note] }))
        // Авто-скрытие через 6 секунд.
        setTimeout(() => get().dismiss(note.id), 6000)
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
    set({ connected: false, notifications: [] })
  },

  dismiss: (id) => {
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) }))
  },
}))

export default useNotificationStore
