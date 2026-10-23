/**
 * Exercise search that works the way lifters type: gym abbreviations
 * ("rdl", "ohp", "db"), word prefixes ("bench pr"), and a one-letter typo
 * ("benhc"). Every word of the query has to match.
 */

/** Common gym shorthand and the words it stands for. */
export const EXERCISE_ALIASES: Record<string, string[]> = {
  rdl: ['romanian', 'deadlift'],
  sldl: ['stiff', 'leg', 'deadlift'],
  dl: ['deadlift'],
  ohp: ['overhead', 'press'],
  bp: ['bench', 'press'],
  sq: ['squat'],
  bb: ['barbell'],
  db: ['dumbbell'],
  kb: ['kettlebell'],
  bw: ['bodyweight'],
  ez: ['ez', 'bar'],
  pu: ['push', 'up'],
  pullup: ['pull', 'up'],
  pullups: ['pull', 'up'],
  chinup: ['chin', 'up'],
  pushup: ['push', 'up'],
  pushups: ['push', 'up'],
  situp: ['sit', 'up'],
  tri: ['triceps'],
  bi: ['biceps'],
  lat: ['lat'],
  hip: ['hip'],
  cable: ['cable'],
  smith: ['smith'],
  rdls: ['romanian', 'deadlift'],
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

/** True when the strings differ by at most one insert, delete, swap or change. */
function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true
  if (Math.abs(a.length - b.length) > 1) return false
  if (a.length === b.length) {
    const diffs: number[] = []
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs.push(i)
    if (diffs.length === 1) return true
    return diffs.length === 2 && diffs[1] === diffs[0] + 1 && a[diffs[0]] === b[diffs[1]] && a[diffs[1]] === b[diffs[0]]
  }
  const [short, long] = a.length < b.length ? [a, b] : [b, a]
  let i = 0
  while (i < short.length && short[i] === long[i]) i++
  return short.slice(i) === long.slice(i + 1)
}

function tokenMatches(token: string, nameWords: string[]): boolean {
  if (nameWords.some((w) => w.startsWith(token))) return true
  if (token.length >= 3 && nameWords.some((w) => w.includes(token))) return true
  if (token.length >= 4) {
    return nameWords.some((w) => withinOneEdit(token, w.slice(0, token.length)) || withinOneEdit(token, w))
  }
  return false
}

/** Query words after alias expansion. */
export function queryTokens(query: string): string[] {
  return words(query).flatMap((w) => EXERCISE_ALIASES[w] ?? [w])
}

export function matchesExercise(name: string, query: string): boolean {
  const tokens = queryTokens(query)
  if (tokens.length === 0) return true
  const nameWords = words(name)
  return tokens.every((t) => tokenMatches(t, nameWords))
}

/** Lower is better: names starting with the query first, then word matches, then the rest. */
export function exerciseRank(name: string, query: string): number {
  const q = words(query).join(' ')
  if (q === '') return 0
  const n = words(name).join(' ')
  if (n.startsWith(q)) return 0
  if (n.includes(q)) return 1
  return 2
}
