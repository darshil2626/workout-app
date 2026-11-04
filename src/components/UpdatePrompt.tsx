import { useRegisterSW } from 'virtual:pwa-register/react'
import { watchForUpdates } from '../lib/updateCheck'

/**
 * A downloaded update waits rather than reloading the page on its own, which
 * would be jarring mid-set. This offers the reload instead. Dismissing it only
 * hides the bar: the update still takes over the next time the app is closed
 * and reopened. A phone that pauses the app instead of closing it would never
 * look for an update at all, so watchForUpdates checks on every return to the
 * screen too.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) watchForUpdates(registration)
    },
  })

  if (!needRefresh) return null

  return (
    <div className="update-toast" role="status">
      <span className="grow">New version ready</span>
      <button className="btn btn-sm btn-ghost" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
      <button className="btn btn-sm btn-primary" onClick={() => void updateServiceWorker()}>
        Reload
      </button>
    </div>
  )
}
