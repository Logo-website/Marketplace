import { create } from 'zustand'

// Общий тост-механизм для действий пользователя (success/error/info).
// Отдельно от notificationStore: тот про серверные WS-события заказов,
// этот - про клиентские сообщения об успехе/ошибке действий.

let idCounter = 0
const TIMEOUT_MS = 4000   // авто-скрытие
const MAX_VISIBLE = 4     // не даём очереди забить экран при потоке действий

const useToastStore = create((set, get) => ({
  toasts: [],

  show: (type, text) => {
    const id = ++idCounter
    set((state) => {
      const next = [...state.toasts, { id, type, text }]
      // Держим только последние MAX_VISIBLE - защита от переполнения.
      return { toasts: next.slice(-MAX_VISIBLE) }
    })
    setTimeout(() => get().dismiss(id), TIMEOUT_MS)
    return id
  },

  dismiss: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
  },
}))

// Удобный фасад: toast.success('...'), toast.error('...'), toast.info('...').
export const toast = {
  success: (text) => useToastStore.getState().show('success', text),
  error: (text) => useToastStore.getState().show('error', text),
  info: (text) => useToastStore.getState().show('info', text),
}

export default useToastStore
