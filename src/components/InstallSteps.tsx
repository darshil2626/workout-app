import { detectInstallPlatform, isIosSafari, useInstall } from '../lib/install'

/**
 * Platform-specific install instructions. Shown in the install sheet and in
 * Settings, so the wording lives in one place.
 */
export function InstallSteps() {
  const platform = detectInstallPlatform()
  const { canPromptNatively, install } = useInstall()

  if (platform === 'ios') {
    return (
      <div className="install-steps">
        {!isIosSafari() && (
          <p className="install-note">
            This only works from Safari. Open this page in Safari first, then follow the steps.
          </p>
        )}
        <ol>
          <li>Open Trana in <strong>Safari</strong>.</li>
          <li>Tap the <strong>Share</strong> button (the square with an arrow pointing up).</li>
          <li>Scroll down and tap <strong>Add to Home Screen</strong>.</li>
          <li>Tap <strong>Add</strong>. Open Trana from your home screen from now on.</li>
        </ol>
      </div>
    )
  }

  if (platform === 'android') {
    return (
      <div className="install-steps">
        {canPromptNatively && (
          <button className="btn btn-primary btn-block" onClick={() => void install()}>
            Install now
          </button>
        )}
        <ol>
          <li>Open Trana in <strong>Chrome</strong>.</li>
          <li>Tap the <strong>⋮</strong> menu in the top right.</li>
          <li>Tap <strong>Install app</strong> (or <strong>Add to Home screen</strong>), then <strong>Install</strong> and confirm.</li>
          <li>Open Trana from your home screen or app drawer.</li>
        </ol>
      </div>
    )
  }

  return (
    <div className="install-steps">
      {canPromptNatively && (
        <button className="btn btn-primary btn-block" onClick={() => void install()}>
          Install now
        </button>
      )}
      <ol>
        <li>Open Trana in <strong>Chrome</strong> or <strong>Edge</strong>.</li>
        <li>Click the install icon at the right of the address bar, or open the menu and choose <strong>Install Trana</strong>.</li>
      </ol>
    </div>
  )
}
