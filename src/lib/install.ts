import { useSyncExternalStore } from 'react'
import { isStandalonePwa, track } from './analytics'

export type InstallPlatform = 'ios' | 'android' | 'desktop'

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
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000

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

export function detectInstallPlatform(): InstallPlatform {
  const ua = window.navigator.userAgent
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios'
  // iPadOS 13+ identifies as a Mac; touch points are what give it away.
  if (/Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1) return 'ios'
  if (/Android/.test(ua)) return 'android'
  return 'desktop'
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

export function isInstallSnoozed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISS_KEY))
    return at > 0 && Date.now() - at < SNOOZE_MS
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
