export type DetectedFormat = 'ironlog' | 'strong' | 'hevy' | 'unknown'

export function detectFormat(text: string): DetectedFormat {
  const trimmed = text.trimStart()
  if (trimmed.startsWith('{')) {
    try {
      const obj: unknown = JSON.parse(trimmed)
      if (obj && typeof obj === 'object' && (obj as { app?: unknown }).app === 'ironlog') return 'ironlog'
    } catch {
      /* not JSON we recognize */
    }
    return 'unknown'
  }

  const firstLine = (trimmed.split(/\r?\n/)[0] ?? '').toLowerCase()
  if (firstLine.includes('exercise_title') && firstLine.includes('set_index')) return 'hevy'
  if (firstLine.includes('workout name') && firstLine.includes('set order')) return 'strong'
  return 'unknown'
}
