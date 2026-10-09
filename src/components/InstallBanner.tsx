import { useState } from 'react'
import { detectInstallPlatform, isInstallSnoozed, snoozeInstall, useInstall } from '../lib/install'
import { Sheet } from './Sheet'
import { InstallSteps } from './InstallSteps'
import { IconClose } from './Icons'

/**
 * Offers to install Trana while it's being used in a browser tab. Hidden once
 * installed, and for three days after being dismissed. On desktop it only shows
 * when the browser can install in one click, so it never nags with steps for a
 * browser that may not support it.
 */
export function InstallBanner() {
  const { installed, canPromptNatively, install } = useInstall()
  const [snoozed, setSnoozed] = useState(isInstallSnoozed)
  const [stepsOpen, setStepsOpen] = useState(false)

  if (installed || snoozed) return null
  if (detectInstallPlatform() === 'desktop' && !canPromptNatively) return null

  function dismiss() {
    snoozeInstall()
    setSnoozed(true)
  }

  function onInstall() {
    if (canPromptNatively) void install()
    else setStepsOpen(true)
  }

  return (
    <>
      <div className="install-banner" role="region" aria-label="Install Trana">
        <div className="grow">
          <div className="install-banner-title">Install Trana</div>
          <div className="faint">Works offline and opens like a native app.</div>
        </div>
        <button className="btn btn-sm btn-primary" onClick={onInstall}>
          {canPromptNatively ? 'Install' : 'How'}
        </button>
        <button className="icon-btn" onClick={dismiss} aria-label="Dismiss">
          <IconClose />
        </button>
      </div>

      <Sheet open={stepsOpen} title="Install Trana" onClose={() => setStepsOpen(false)}>
        <InstallSteps />
      </Sheet>
    </>
  )
}
