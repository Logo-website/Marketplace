import { Component } from 'react'
import ErrorState from './ErrorState'

// Предохранитель рендера: ловит краш любого компонента-потомка и показывает
// экран ошибки вместо белого листа. resetKey (маршрут) сбрасывает состояние
// при навигации - иначе после краша пользователь застрял бы на экране ошибки.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, resetKey: props.resetKey }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  // Сменился маршрут - убираем экран ошибки и пробуем отрендерить заново.
  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) {
      return { hasError: false, resetKey: props.resetKey }
    }
    return null
  }

  componentDidCatch(error, info) {
    // Лог в консоль; внешняя аналитика ошибок (Sentry) вне скоупа проекта.
    console.error('ErrorBoundary поймал ошибку рендера:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="max-w-3xl mx-auto px-4 py-16">
          <ErrorState
            title="Что-то сломалось"
            subtitle="Произошла ошибка в приложении. Попробуйте обновить страницу."
            onRetry={() => window.location.reload()}
            retryLabel="Обновить страницу"
          />
        </div>
      )
    }
    return this.props.children
  }
}
