import { useState } from 'react'
import { Header } from '../components/Header'
import {
  buildPayload,
  feedbackMode,
  readDeviceInfo,
  submitFeedback,
  validateFeedback,
  type FeedbackFields,
} from '../lib/feedback'
import { PRIVACY_URL } from '../lib/links'

const BLANK: FeedbackFields = { happened: '', expected: '', email: '', rating: null, includeDeviceInfo: true }

export function FeedbackPage() {
  const [fields, setFields] = useState<FeedbackFields>(BLANK)
  const [error, setError] = useState<string | null>(null)
  const [trap, setTrap] = useState(false)
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'mail'>('idle')
  const mode = feedbackMode()

  function set<K extends keyof FeedbackFields>(key: K, value: FeedbackFields[K]) {
    setFields((f) => ({ ...f, [key]: value }))
  }

  async function send() {
    const problem = validateFeedback(fields)
    if (problem) {
      setError(problem)
      return
    }
    setError(null)
    // A filled spam trap gets a quiet fake success and nothing is sent.
    if (trap) {
      setState('sent')
      return
    }
    setState('sending')
    const result = await submitFeedback(buildPayload(fields, readDeviceInfo()))
    if (result.ok) {
      setState(result.via === 'mailto' ? 'mail' : 'sent')
      setFields(BLANK)
    } else {
      setState('idle')
      setError(
        result.reason === 'not-configured'
          ? 'Feedback is not set up yet.'
          : result.reason === 'rate-limited'
            ? 'Lots of feedback is coming in right now. Please try again in a few minutes. Your message is still here.'
            : result.reason === 'rejected'
              ? 'The feedback service did not accept that. Check the form and try again, or come back later. Your message is still here.'
              : 'That did not send. Check your connection and try again. Your message is still here.',
      )
    }
  }

  return (
    <>
      <Header title="Send feedback" back="/settings" />
      <div className="page">
        {state === 'sent' || state === 'mail' ? (
          <div className="card" role="status">
            <div style={{ fontWeight: 650 }}>
              {state === 'sent' ? 'Thanks, that is sent.' : 'Your mail app should be open.'}
            </div>
            <p className="muted" style={{ marginTop: 6 }}>
              {state === 'sent'
                ? 'I read every one of these.'
                : 'Press send in your mail app to finish. Nothing has been sent until you do.'}
            </p>
            <button className="btn btn-ghost btn-block" style={{ marginTop: 12 }} onClick={() => setState('idle')}>
              Send another
            </button>
          </div>
        ) : (
          <>
            {mode === 'disabled' && (
              <div className="card" style={{ borderColor: 'var(--danger)', marginBottom: 12 }} role="status">
                <p className="muted">
                  Feedback is not set up on this copy of the app yet, so this form cannot send anything.
                </p>
              </div>
            )}
            <p className="muted">Found a bug, or something confusing? Tell me what happened.</p>

            <div className="field" style={{ marginTop: 12 }}>
              <label className="field-label" htmlFor="fb-happened">
                What happened?
              </label>
              <textarea
                id="fb-happened"
                className="input"
                rows={4}
                value={fields.happened}
                onChange={(e) => set('happened', e.target.value)}
              />
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label className="field-label" htmlFor="fb-expected">
                What did you expect? (optional)
              </label>
              <textarea
                id="fb-expected"
                className="input"
                rows={3}
                value={fields.expected}
                onChange={(e) => set('expected', e.target.value)}
              />
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <span className="field-label" id="fb-rating-label">
                How is Trana so far? (optional)
              </span>
              <div className="chips" role="group" aria-labelledby="fb-rating-label">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    className={`chip${fields.rating === n ? ' active' : ''}`}
                    style={{ width: 44, height: 44, padding: 0 }}
                    aria-pressed={fields.rating === n}
                    onClick={() => set('rating', fields.rating === n ? null : n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label className="field-label" htmlFor="fb-email">
                Your email, if you want a reply (optional)
              </label>
              <input
                id="fb-email"
                className="input"
                type="email"
                autoComplete="email"
                value={fields.email}
                onChange={(e) => set('email', e.target.value)}
              />
            </div>

            <label className="row" style={{ gap: 10, marginTop: 14, alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={fields.includeDeviceInfo}
                onChange={(e) => set('includeDeviceInfo', e.target.checked)}
              />
              <span>
                Include app version and device info
                <span className="faint" style={{ display: 'block' }}>
                  App build, browser, phone or computer type, language and screen size.
                </span>
              </span>
            </label>

            {/* Spam trap: hidden from people and screen readers, bots tend to fill it. */}
            <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
              <label>
                Leave this empty
                <input
                  type="checkbox"
                  name="botcheck"
                  tabIndex={-1}
                  autoComplete="off"
                  checked={trap}
                  onChange={(e) => setTrap(e.target.checked)}
                />
              </label>
            </div>

            <p className="faint" style={{ marginTop: 14 }}>
              What is sent: only what is on this form, plus the device info if ticked. Never your workouts, routines or
              measurements. It goes through Web3Forms, a form service, to the developer's inbox, and Web3Forms keeps
              submissions for up to 3 years. Your email is used only to reply.{' '}
              <a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer">
                Privacy policy
              </a>
            </p>

            {error && (
              <p role="alert" style={{ color: 'var(--danger)', fontSize: '0.875rem', marginTop: 10 }}>
                {error}
              </p>
            )}

            <button
              className="btn btn-primary btn-block"
              style={{ marginTop: 14 }}
              disabled={state === 'sending' || mode === 'disabled'}
              onClick={() => void send()}
            >
              {state === 'sending' ? 'Sending...' : mode === 'mailto' ? 'Open in my mail app' : 'Send feedback'}
            </button>
          </>
        )}
      </div>
    </>
  )
}
