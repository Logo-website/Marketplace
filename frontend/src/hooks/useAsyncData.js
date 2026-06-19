import { useState, useEffect, useCallback } from 'react'
import axios from 'axios'

// Единый хук загрузки данных с GET-запросов.
// Возвращает { data, status, error, retry, setData }, где
// status ∈ {loading, error, ready}.
//
// fetcher: (signal) => Promise<data> - функция запроса, получает AbortSignal
//          (передавайте его в axios: api.get(url, { signal })).
// deps:    массив зависимостей - при их изменении запрос повторяется.
//
// Закрывает главную дыру Ф0: «пусто» (ready + длина 0) и «ошибка» (error)
// больше не путаются. Плюс защита от гонки - ответ устаревшего запроса
// не перетирает свежий.
export default function useAsyncData(fetcher, deps = []) {
  const [data, setData] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    // Сброс в loading при смене запроса - часть синхронизации с внешним API.
    /* eslint-disable react-hooks/set-state-in-effect */
    setStatus('loading')
    setError(null)
    /* eslint-enable react-hooks/set-state-in-effect */

    fetcher(controller.signal)
      .then((result) => {
        if (!active) return
        setData(result)
        setStatus('ready')
      })
      .catch((err) => {
        if (!active) return
        // Отменённый запрос (сменились deps / размонтирование) - не ошибка.
        if (axios.isCancel?.(err) || err?.code === 'ERR_CANCELED') return
        // 401 обрабатывает интерсептор API (рефреш токена или редирект на
        // логин) - не показываем поверх него экран ошибки.
        if (err?.response?.status === 401) return
        setError(err)
        setStatus('error')
      })

    return () => {
      active = false
      controller.abort()
    }
    // fetcher намеренно не в deps: новая функция на каждом рендере = цикл.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadKey])

  // Повтор только по явному вызову - без авто-ретраев в цикле.
  const retry = useCallback(() => setReloadKey((k) => k + 1), [])

  return { data, status, error, retry, setData }
}
