import axios from 'axios'

// Локально VITE_API_URL не задан -> относительный '/api' (прокси Vite на :8001).
// На проде фронт и бэк на разных доменах: при сборке подставляем полный URL бэка.
const API_BASE = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_BASE,
})

// Автоматически добавляем JWT токен к каждому запросу
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Единый refresh «в полёте»: параллельные 401 ждут один общий запрос, а не
// запускают N конкурентных refresh (F2). Иначе первый блэклистит токен, а
// остальные ловят 401 на уже отозванном токене и выкидывают пользователя на /login.
let refreshPromise = null

async function doRefresh() {
  const refresh = localStorage.getItem('refresh_token')
  // Голый axios, а не api: на самом refresh не должен срабатывать этот же
  // response-интерсептор, иначе 401 на refresh зациклит обновление.
  const res = await axios.post(`${API_BASE}/auth/token/refresh/`, { refresh })
  localStorage.setItem('access_token', res.data.access)
  // F1: при ROTATE_REFRESH_TOKENS + BLACKLIST_AFTER_ROTATION бэк возвращает
  // новый refresh, а старый блэклистит. Обязаны сохранить новый, иначе
  // следующий refresh уйдёт с заблокированным токеном -> выброс на логин.
  if (res.data.refresh) {
    localStorage.setItem('refresh_token', res.data.refresh)
  }
  return res.data.access
}

// Возвращает общий промис обновления access. Параллельные вызовы получают одну
// и ту же ссылку, поэтому POST /token/refresh/ уходит ровно один раз.
export function refreshAccessToken() {
  if (!refreshPromise) {
    // Обнуляем ссылку после settle (и успех, и провал), иначе после первого
    // refresh промис «залипнет» и следующее истечение access не запустит новый.
    refreshPromise = doRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

// Если токен истёк — обновляем автоматически
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config
    // F5: повторяем исходный запрос только один раз. Устойчивый 401 (например,
    // отозванный аккаунт) не должен зациклить refresh.
    if (error.response?.status === 401 && original && !original._retry) {
      if (localStorage.getItem('refresh_token')) {
        original._retry = true
        try {
          const access = await refreshAccessToken()
          original.headers.Authorization = `Bearer ${access}`
          return api(original)
        } catch {
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(error)
  }
)

export default api
