import { useSyncExternalStore } from 'react'
import { isStandalonePwa, track } from './analytics'

import { detectInstallPlatform } from './platform'

export { detectInstallPlatform }
export type { InstallPlatform } from './platform'

/** Chrome's `beforeinstallprompt` event, which lib.dom doesn't type. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

interface InstallState {
  /** Set only where the browser offers a one-tap install (Chromium). */
  prompt: BeforeInstallPromptEvent | null
  installed: boolean
}

const DISMISS_KEY = 'trana_install_dismissed'
const DAY_MS = 24 * 60 * 60 * 1000

let state: InstallState = { prompt: null, installed: isStandalonePwa() }
const listeners = new Set<() => void>()

function setState(next: InstallState) {
  state = next
  listeners.forEach((l) => l())
}

// Registered at import so the event isn't missed if it fires before React
// mounts. Default is prevented so Chrome's own mini-infobar doesn't compete
// with ours; the event is kept and replayed when the user taps Install.
// iOS Safari has no equivalent, so there install is instructions only.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    track('pwa_install_prompt_shown')
    setState({ ...state, prompt: e as BeforeInstallPromptEvent })
  })
  window.addEventListener('appinstalled', () => {
    setState({ prompt: null, installed: true })
  })
}

/**
 * iOS only lets Safari (and, since 16.4, a few others) add to the Home Screen,
 * and in-app browsers (Instagram, Facebook, etc.) can't at all. Anything but
 * plain Safari gets a "open in Safari" nudge rather than steps that may not
 * exist in the browser they're using.
 */
export function isIosSafari(): boolean {
  const ua = window.navigator.userAgent
  return !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|FBAN|FBAV|Instagram|Line|MicroMessenger/.test(ua)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useInstall() {
  const { prompt, installed } = useSyncExternalStore(subscribe, () => state)

  async function install(): Promise<boolean> {
    if (!prompt) return false
    await prompt.prompt()
    const { outcome } = await prompt.userChoice
    track(outcome === 'accepted' ? 'pwa_install_accepted' : 'pwa_install_dismissed')
    // A prompt event can only be used once, accepted or not.
    setState({ ...state, prompt: null })
    return outcome === 'accepted'
  }

  return { installed, canPromptNatively: prompt !== null, install }
}

/**
 * On iOS an uninstalled copy is at risk of losing its data (see
 * `uninstalledDataAtRisk`), so the prompt comes back after a day rather than three.
 */
function snoozeMs(): number {
  return (detectInstallPlatform() === 'ios' ? 1 : 3) * DAY_MS
}

/**
 * Safari (and every other iOS browser, which all use its engine) may clear a
 * website's stored data after about a week without the person opening it in a
 * browser tab. Apps added to the Home Screen are exempt. Trana keeps everything in
 * that storage, so an uninstalled iPhone user can lose their whole history
 * without ever being told. Worth re-checking against current WebKit policy.
 */
export function uninstalledDataAtRisk(installed: boolean): boolean {
  return detectInstallPlatform() === 'ios' && !installed
}

export function isInstallSnoozed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY))
    return at > 0 && Date.now() - at < snoozeMs()
  } catch {
    return false
  }
}

export function snoozeInstall(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()))
  } catch {
    // Private mode: the banner just comes back next visit.
  }
}
