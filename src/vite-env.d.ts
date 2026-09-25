/// <reference types="vite/client" />

/** Build timestamp and commit, injected by `define` in vite.config.ts. */
declare const __BUILD_ID__: string

interface ImportMetaEnv {
  /** PostHog project API token. Unset in local dev — analytics no-ops without it. */
  readonly VITE_POSTHOG_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
