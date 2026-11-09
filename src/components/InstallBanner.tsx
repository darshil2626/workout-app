import { useEffect, useState } from 'react'
import { installBannerHidden, isInstallSnoozed, snoozeInstall, uninstalledDataAtRisk, useInstall } from '../lib/install'
import { downloadBackup } from '../lib/backup'
import { track } from '../lib/analytics'
import { Sheet } from './Sheet'
import { InstallSteps } from './InstallSteps'
import { IconClose } from './Icons'

/**
 * Offers to install Trana while it's being used in a browser tab. Hidden once
 * installed, and for a while after being dismissed (see `installBannerHidden`).
 *
 * On iOS a Safari tab and a Home Screen app keep separate storage, so a workout
 * logged in the tab does not appear in the installed app; and Safari may delete a
 * tab's data after about a week unused, while installed apps are exempt. So on iOS
 * the banner says "install first" before any history exists, and once there is
 * history it offers an export to carry it across (Settings → Import in the app).
 */
export function InstallBanner({
  hasHistory = true,
  onShownChange,
}: {
  hasHistory?: boolean
  onShownChange?: (shown: boolean) => void
}) {
  const { installed, canPromptNatively, install } = useInstall()
  const [snoozed, setSnoozed] = useState(isInstallSnoozed)
  const [stepsOpen, setStepsOpen] = useState(false)

  const atRisk = uninstalledDataAtRisk(installed)
  const hidden = installBannerHidden({ installed, snoozed, canPromptNatively })
  useEffect(() => {
    onShownChange?.(!hidden)
  }, [hidden, onShownChange])
  if (hidden) return null

  function dismiss() {
    snoozeInstall()
    setSnoozed(true)
  }

  function onInstall() {
    if (canPromptNatively) void install()
    else setStepsOpen(true)
  }

  function onExport() {
    void downloadBackup().then((outcome) => {
      if (outcome !== 'cancelled') track('backup_exported', { source: 'install_banner' })
    })
  }

  const [title, body] = !atRisk
    ? ['Install Trana', 'Works offline and opens like a native app.']
    : !hasHistory
      ? [
          'Add Trana to your Home Screen first',
          'Your workouts are saved on this phone, inside whichever app you open Trana from. Install first so your first workout lands in the app you’ll keep using.',
        ]
      : [
          'Add to Home Screen to keep your data',
          'Safari can delete a website’s data after about a week unused, and the Home Screen app starts empty. Export a backup, install, then use Settings → Import in the app.',
        ]

  return (
    <>
      <div className="install-banner" role="region" aria-label="Install Trana">
        <div className="grow">
          <div className="install-banner-title">{title}</div>
          <div className="faint">{body}</div>
        </div>
        <div className="install-banner-actions">
          {atRisk && hasHistory && (
            <button className="btn btn-sm" onClick={onExport}>
              Export backup
            </button>
          )}
          <button className="btn btn-sm btn-primary" onClick={onInstall}>
            {canPromptNatively ? 'Install' : 'How'}
          </button>
        </div>
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
