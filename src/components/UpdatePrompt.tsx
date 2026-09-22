import { useRegisterSW } from 'virtual:pwa-register/react'

/**
 * A downloaded update waits rather than reloading the page on its own, which
 * would be jarring mid-set. This offers the reload instead. Dismissing it only
 * hides the bar: the update still takes over the next time the app is closed
 * and reopened, so nobody gets stranded on an old build.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

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
