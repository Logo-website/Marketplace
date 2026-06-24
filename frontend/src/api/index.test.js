import { describe, it, expect, vi, beforeEach } from 'vitest'

// Мокаем axios: модуль на импорте зовёт axios.create() и регистрирует
// интерсепторы, а doRefresh() — axios.post(). Нам нужен только спай на post.
vi.mock('axios', () => ({
  default: {
    create: () => ({
      interceptors: {
        request: { use: () => {} },
        response: { use: () => {} },
      },
    }),
    post: vi.fn(),
  },
}))

import axios from 'axios'
import { refreshAccessToken } from './index'

describe('refreshAccessToken — единый refresh «в полёте»', () => {
  beforeEach(() => {
    const store = {}
    vi.stubGlobal('localStorage', {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v) },
      removeItem: (k) => { delete store[k] },
    })
    axios.post.mockReset()
  })

  it('N параллельных вызовов -> один POST /token/refresh/, ротированный refresh сохранён (F1+F2)', async () => {
    localStorage.setItem('refresh_token', 'R1')
    let resolvePost
    axios.post.mockReturnValue(new Promise((r) => { resolvePost = r }))

    const p1 = refreshAccessToken()
    const p2 = refreshAccessToken()
    const p3 = refreshAccessToken()

    // Гонка трёх 401: запрос на обновление ушёл ровно один раз.
    expect(axios.post).toHaveBeenCalledTimes(1)

    resolvePost({ data: { access: 'A2', refresh: 'R2' } })
    const [a1, a2, a3] = await Promise.all([p1, p2, p3])

    // Все ждали один общий refresh и получили один и тот же новый access.
    expect(a1).toBe('A2')
    expect(a2).toBe('A2')
    expect(a3).toBe('A2')
    expect(localStorage.getItem('access_token')).toBe('A2')
    // F1: ротированный refresh записан, старый R1 затёрт.
    expect(localStorage.getItem('refresh_token')).toBe('R2')
  })

  it('после завершения refresh промис сброшен — следующий вызов запускает новый refresh', async () => {
    localStorage.setItem('refresh_token', 'R1')
    axios.post.mockResolvedValue({ data: { access: 'A2', refresh: 'R2' } })

    await refreshAccessToken()
    expect(axios.post).toHaveBeenCalledTimes(1)

    // in-flight-промис обнулён в finally -> новое истечение access снова рефрешит.
    await refreshAccessToken()
    expect(axios.post).toHaveBeenCalledTimes(2)
  })

  it('если бэк не вернул новый refresh — старый refresh сохраняется (F1, ветка «если пришёл»)', async () => {
    localStorage.setItem('refresh_token', 'R1')
    axios.post.mockResolvedValue({ data: { access: 'A2' } })

    await refreshAccessToken()
    expect(localStorage.getItem('access_token')).toBe('A2')
    expect(localStorage.getItem('refresh_token')).toBe('R1')
  })
})
