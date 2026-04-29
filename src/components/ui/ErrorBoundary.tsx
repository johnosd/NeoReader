import React, { type ReactNode } from 'react'

interface ErrorBoundaryState {
  hasError: boolean
}

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
}

// Class component — único jeito de capturar erros de render em React (getDerivedStateFromError)
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false })
    this.props.onReset?.()
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <DefaultErrorFallback onReset={this.handleReset} />
      )
    }
    return this.props.children
  }
}

function DefaultErrorFallback({ onReset }: { onReset: () => void }) {
  return (
    <div className="fixed inset-0 bg-bg-base flex flex-col items-center justify-center gap-4 px-8">
      <p className="text-text-primary text-base text-center font-medium">
        Algo deu errado nesta tela.
      </p>
      <button
        type="button"
        onClick={onReset}
        className="px-6 py-2.5 rounded-full bg-indigo-primary text-white text-sm font-semibold
          active:scale-95 transition-transform"
      >
        Tentar novamente
      </button>
    </div>
  )
}
