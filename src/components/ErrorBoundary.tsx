import { Component, type ErrorInfo, type ReactNode } from 'react'
import { track } from '../lib/analytics'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

/**
 * Top-level render-error catch-all. Without this, one uncaught exception
 * anywhere in the tree unmounts the whole app and leaves a blank screen —
 * on an offline-first Dexie app the data is safe, but the person has no way
 * back in short of knowing to reload manually. This only ever needs a
 * `window.location.reload()` escape hatch: state (workout in progress, rest
 * timer) lives in Dexie/IndexedDB and React context, not here, so a fresh
 * load picks it back up.
 *
 * Must be a class component — `componentDidCatch`/`getDerivedStateFromError`
 * have no hook equivalent.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled render error', error, info.componentStack)
    // Usage analytics only — no message/stack, which could contain workout
    // content interpolated into an error string.
    track('render_error')
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="app">
        <main className="app-main">
          <div className="empty">
            <div className="empty-icon">⚠️</div>
            <h3>Something went wrong</h3>
            <p className="muted">
              IronLog hit an unexpected error. Your workouts and history are saved on this device
              and are safe — reloading should get you back in.
            </p>
            <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </main>
      </div>
    )
  }
}
