import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings } from '../db/repo'
import { updateSettings } from '../lib/useSettings'
import { PRIVACY_URL } from '../lib/links'

/**
 * Asks, once, whether anonymous usage analytics may run. Nothing is sent, or even
 * set up, before an answer, and "No thanks" is as easy to reach as "Share".
 * Shown on Home until answered; the choice can be changed later in Settings.
 */
export function AnalyticsConsent() {
  const settings = useLiveQuery(() => getSettings(), [])
  // Not until the stored settings have loaded: the defaults say "unanswered".
  if (!settings || settings.analyticsConsentAt !== null) return null

  const answer = (share: boolean) => void updateSettings({ analyticsEnabled: share, analyticsConsentAt: Date.now() })

  return (
    <div className="install-banner" role="region" aria-label="Usage data">
      <div className="grow">
        <div className="install-banner-title">Help improve Trana?</div>
        <div className="faint">
          Share which screens get used, never your workouts. Nothing is sent unless you say yes.{' '}
          <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
            Privacy policy
          </a>
        </div>
      </div>
      <button className="btn btn-sm btn-primary" onClick={() => answer(true)}>
        Share
      </button>
      <button className="btn btn-sm" onClick={() => answer(false)}>
        No thanks
      </button>
    </div>
  )
}
