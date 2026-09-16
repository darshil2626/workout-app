// Matches the seed exercise library against the Workout Guide illustration set,
// downloads the matched frames into public/exercise-art/ and writes the
// src/db/exerciseArt.ts lookup. Run with: node scripts/match-exercise-illustrations.mjs
// Set FORCE=1 to re-download frames that are already on disk.
import { mkdir, readFile, writeFile, access } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ART_DIR = join(ROOT, 'public', 'exercise-art')

const REPO = 'https://raw.githubusercontent.com/bryllim/workout-guide/main/packages/workout-guide'
const MANIFEST_URL = `${REPO}/manifest.json`

// Matches --text in src/index.css. The source art is pure white, which is
// harsher than anything else on the app's surfaces.
const FIGURE = '#eef1f6'

const STOP = new Set(['the', 'with', 'a', 'an', 'and', 'or', 'to', 'on', 'of', 'in'])

// Words that describe the same movement under a different name.
const SYN = {
  biceps: 'bicep', triceps: 'tricep', skullcrusher: 'skullcrush', skull: 'skullcrush',
  crusher: 'skullcrush', crossover: 'fly', flye: 'fly', flyes: 'fly', flys: 'fly',
  flies: 'fly', farmers: 'farmer', carry: 'walk', abdominal: 'ab',
  quadriceps: 'quad', lats: 'lat', db: 'dumbbell', bb: 'barbell', kb: 'kettlebell',
  ez: 'ezbar', hyperextension: 'extension', situp: 'sit', pushup: 'push',
  pullup: 'pull', chinup: 'chin', ups: 'up', downs: 'down', kicks: 'kick',
  thrusts: 'thrust', walks: 'walk',
}

// Body-part and stance words that only qualify a movement. A drawing missing
// one is still the right drawing ("Dumbbell Fly" for "Chest Fly"), so their
// absence costs a fraction of a normal word rather than failing coverage.
const QUALIFIER = new Set([
  'chest', 'back', 'ab', 'glute', 'tricep', 'bicep', 'leg', 'shoulder', 'hip',
  'calf', 'neck', 'wrist', 'lat', 'quad', 'hamstring', 'forearm', 'trap',
  'standing', 'seated', 'lying', 'machine', 'cable', 'barbell', 'dumbbell',
  'bar', 'ezbar', 'plate', 'outdoor', 'indoor',
])

// This app's "Name (Equipment)" vocabulary mapped onto the catalog's values.
// The first entry is the exact expectation; the rest are acceptable stand-ins
// (a cable drawing is fine for a Machine row). null means "no expectation".
const EQUIPMENT = {
  Barbell: ['Barbell', 'Machine', 'Plate'],
  Dumbbell: ['Dumbbell', 'Kettlebell'],
  Machine: ['Machine', 'Cable'],
  Cable: ['Cable', 'Machine', 'Resistance Band'],
  Bodyweight: ['Bodyweight', 'Pull-up Bar', 'Bench', 'Box', 'Chair', 'Wall', 'Doorway', 'Towel', 'Stability Ball', 'Machine'],
  Kettlebell: ['Kettlebell', 'Dumbbell'],
  Band: ['Resistance Band', 'Cable'],
  Plate: ['Plate', 'Barbell', 'Dumbbell'],
  'Smith Machine': ['Machine', 'Barbell'],
  Other: null,
}

// Cardio rows care about the modality, not the implement, and the catalog files
// every one of them under a single "Cardio" equipment value. Plain 'duration'
// is deliberately not a cardio signal — a plank is timed but is not cardio.
const CARDIO_KINDS = new Set(['distance_duration'])

// Hand-picked for rows the scorer gets wrong or cannot reach: different
// vernacular for the same lift, or a close cousin standing in for a movement
// the catalog does not draw. null means "no honest match — draw nothing".
const ALIAS = {
  'floor-press-barbell': 'bench-press',
  'bench-press-smith-machine': 'smith-machine-bench-press',
  'incline-bench-press-dumbbell': 'incline-dumbbell-press',
  'decline-bench-press-dumbbell': 'decline-dumbbell-press',
  'incline-chest-press-machine': 'machine-chest-press',
  'reverse-cable-fly': 'cable-rear-delt-fly',
  'rear-delt-fly-machine': 'reverse-pec-deck',
  'single-arm-row-dumbbell': 'one-arm-dumbbell-row',
  'reverse-wrist-curl-barbell': 'wrist-extension',
  'alternating-bicep-curl': 'bicep-curl',
  'squat-smith-machine': 'smith-machine-squat',
  'glute-kickback-cable': 'cable-kickback',
  'cable-crossover': 'cable-fly',
  'low-cable-crossover': 'incline-cable-fly',
  'bent-over-row-barbell': 'barbell-row',
  'seal-row': 'chest-supported-row',
  hyperextension: 'back-extension',
  'shrug-machine': 'shrug',
  'overhead-press-dumbbell': 'standing-dumbbell-press',
  'behind-the-neck-press': 'overhead-press',
  'bicep-curl-barbell': 'drag-curl',
  'bicep-curl-ez-bar': 'ez-bar-curl',
  'bicep-curl-cable': 'cable-curl',
  'bayesian-curl': 'cable-curl',
  'zottman-curl': 'reverse-curl',
  'triceps-dip': 'dip',
  'triceps-pushdown-cable': 'tricep-pushdown',
  'skullcrusher-ez-bar': 'skull-crusher',
  'triceps-extension-machine': 'overhead-tricep-extension',
  'triceps-kickback-dumbbell': 'tricep-kickback',
  'triceps-kickback-cable': 'cable-kickback',
  'jm-press': 'close-grip-bench-press',
  'wrist-curl-dumbbell': 'wrist-curl',
  'farmers-walk': 'farmer-carry',
  'high-bar-squat': 'squat',
  'low-bar-squat': 'squat',
  'box-squat': 'single-leg-box-squat',
  'air-squat': 'bodyweight-squat',
  'stiff-leg-deadlift': 'romanian-deadlift',
  'glute-ham-raise': 'nordic-hamstring-curl',
  'frog-pump': 'frog-pump',
  'calf-raise-dumbbell': 'calf-raise',
  'ab-crunch-machine': 'cable-crunch',
  'captains-chair-leg-raise': 'captains-chair-knee-raise',
  'toes-to-bar': 'hanging-leg-raise',
  'woodchopper-cable': 'cable-woodchop',
  'mountain-climbers': 'mountain-climber',
  'running-treadmill': 'running',
  'running-outdoor': 'running',
  walking: 'walking',
  'incline-walking-treadmill': 'treadmill-incline-walk',
  'cycling-indoor': 'cycling',
  'rowing-machine': 'rowing',
  'ski-erg': 'skierg',
  'assault-bike': 'assault-bike',
  elliptical: 'elliptical',
  'stair-climber': 'stair-climber',
  hiking: 'hiking',
  stretching: 'worlds-greatest-stretch',
  'preacher-curl': 'preacher-curl',
  'chest-fly-dumbbell': 'dumbbell-fly',
  'chest-fly-machine': 'pec-deck',
  'pullover-dumbbell': 'straight-arm-pulldown',
  't-bar-row': 't-bar-row',
  'upright-row-cable': 'upright-row',
  // No honest drawing exists for these in the catalog.
  'svend-press': null,
  'plate-pinch': null,
  'zercher-squat': null,
  'neck-curl': null,
  'neck-extension': null,
  'clean-and-jerk': null,
  'power-clean': null,
  'hang-clean': null,
  clean: null,
  snatch: null,
  thruster: null,
  'turkish-get-up': null,
  'devil-press': null,
  'man-maker': null,
  'wall-ball': null,
  'box-jump': null,
  'broad-jump': null,
  'sled-push': null,
  'sled-pull': null,
  hiit: null,
  yoga: null,
  'foam-rolling': null,
}

// Mirrors slugify in src/db/seed.ts. Duplicated rather than imported because
// that file is TypeScript and this script runs as plain node.
function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function stem(t) {
  if (SYN[t]) return SYN[t]
  if (t.length > 3 && t.endsWith('ies')) return `${t.slice(0, -3)}y`
  if (t.length > 3 && t.endsWith('es') && !t.endsWith('ses')) return t.slice(0, -2)
  if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1)
  return t
}

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(stem)
    .map((t) => SYN[t] ?? t)
    .filter((t) => !STOP.has(t))
}

function baseName(full) {
  const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(full)
  return m ? m[1] : full
}

function parseSeedRows(text) {
  const rows = []
  const re = /^\s*\[\s*'([^']*)'\s*,\s*'([^']*)'\s*,\s*'([^']*)'(?:\s*,\s*'([^']*)')?/gm
  let m
  while ((m = re.exec(text)) !== null) {
    rows.push({ name: m[1], muscleGroup: m[2], equipment: m[3], kind: m[4] ?? 'weight_reps' })
  }
  return rows
}

// Coverage weights every word of the seed name by how much it narrows the
// movement: a missing qualifier ("chest" in "Chest Fly") barely counts, a
// missing head word ("fly") sinks the candidate.
function score(row, cand) {
  const core = tokenize(baseName(row.name))
  let got = 0
  let total = 0
  for (const t of core) {
    const weight = QUALIFIER.has(t) ? 0.25 : 1
    total += weight
    if (cand.tokens.has(t)) got += weight
  }
  const coverage = total === 0 ? 0 : got / total
  const extra = Math.max(0, cand.tokenCount - core.filter((t) => cand.tokens.has(t)).length)

  const cardio = CARDIO_KINDS.has(row.kind) || row.muscleGroup === 'Cardio'
  const want = cardio ? ['Cardio'] : EQUIPMENT[row.equipment]
  const equipmentExact = want ? cand.equipment === want[0] : false
  const equipmentOk = want ? want.includes(cand.equipment) : null

  let points = coverage * 100
  if (equipmentExact) points += 20
  else if (equipmentOk) points += 8
  else if (want) points -= 18
  points -= extra * 7
  if (row.muscleGroup === cand.primaryMuscle) points += 4
  return { points, coverage, extra, equipmentOk }
}

function match(rows, catalog) {
  const bySlug = new Map(catalog.map((c) => [c.slug, c]))
  const matched = {}
  const unmatched = []

  for (const row of rows) {
    const id = slugify(row.name)
    let chosen = null

    if (Object.prototype.hasOwnProperty.call(ALIAS, id)) {
      const slug = ALIAS[id]
      if (slug && !bySlug.has(slug)) throw new Error(`alias target missing from catalog: ${id} -> ${slug}`)
      if (slug) chosen = bySlug.get(slug)
    } else {
      let best = null
      for (const cand of catalog) {
        const s = score(row, cand)
        if (!best || s.points > best.s.points) best = { cand, s }
      }
      // Full name coverage with the right apparatus is a safe match; a weaker
      // hit is left to the muscle-group label rather than drawn wrongly.
      const good =
        best &&
        ((best.s.coverage >= 0.99 && best.s.equipmentOk !== false && best.s.extra <= 2) ||
          (best.s.coverage >= 0.7 && best.s.points >= 60))
      if (good) chosen = best.cand
    }

    if (chosen) matched[id] = chosen.slug
    else unmatched.push(row.name)
  }

  return { matched, unmatched }
}

// ── SVG optimisation ────────────────────────────────────────────────────────

// The source art is vector-traced at a precision the 512-unit viewBox cannot
// show at display size, so every coordinate rounds to an integer. Tokenising
// the path rather than regex-replacing in place is what keeps "c.258.773" from
// collapsing into the single number "00".
function roundPathData(d) {
  const tokens = d.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?|[A-Za-z]/g) ?? []
  const numbers = tokens.filter((t) => !/[A-Za-z]/.test(t)).length
  const out = tokens
    .map((t) => (/[A-Za-z]/.test(t) ? t : String(Math.round(Number(t)))))
    .join(' ')
    .replace(/([A-Za-z]) /g, '$1')

  // A dropped or merged coordinate silently deforms the figure, so prove the
  // count survived the round trip before writing anything.
  const after = (out.match(/-?\d+/g) ?? []).length
  if (after !== numbers) throw new Error(`path rounding changed the coordinate count: ${numbers} -> ${after}`)
  return out
}

function optimise(svg) {
  return svg
    .replace(/ d="([^"]*)"/g, (_, d) => ` d="${roundPathData(d)}"`)
    .replace(/fill="#fff"/gi, `fill="${FIGURE}"`)
}

// ── Fetching ────────────────────────────────────────────────────────────────

async function fetchWithRetry(url, asText) {
  let lastError
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
      return asText ? res.text() : res.json()
    } catch (err) {
      lastError = err
    }
  }
  throw lastError
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function downloadFrames(slugs) {
  const force = Boolean(process.env.FORCE)
  let written = 0
  let skipped = 0
  let bytes = 0

  // Batched rather than all at once so a 160-drawing run does not open 480
  // sockets against raw.githubusercontent.com.
  const batchSize = 12
  for (let i = 0; i < slugs.length; i += batchSize) {
    const batch = slugs.slice(i, i + batchSize)
    await Promise.all(
      batch.map(async (slug) => {
        await mkdir(join(ART_DIR, slug), { recursive: true })
        for (const frame of [1, 2, 3]) {
          const file = join(ART_DIR, slug, `frame-${frame}.svg`)
          if (!force && (await exists(file))) {
            skipped += 1
            continue
          }
          const svg = optimise(await fetchWithRetry(`${REPO}/assets/${slug}/frame-${frame}.svg`, true))
          await writeFile(file, svg)
          written += 1
          bytes += Buffer.byteLength(svg)
        }
      }),
    )
    console.log(`  frames ${Math.min(i + batchSize, slugs.length)}/${slugs.length} drawings`)
  }

  return { written, skipped, bytes }
}

// ── Generated output ────────────────────────────────────────────────────────

const LICENSE = `# Exercise illustration credits

The figures in this directory come from
[Workout Guide](https://github.com/bryllim/workout-guide) by Bryl Lim, built on pose
artwork from [Everkinetic](https://github.com/everkinetic/data). Both are licensed
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), which allows commercial
use provided the credit above is given, the licence is linked, changes are indicated, and
adaptations are distributed under the same licence.

Changes made to the originals by this project:

- Every path coordinate rounded to an integer on the 512-unit viewBox, to cut the
  download size. Invisible at the size the app draws them.
- The figure fill changed from \`#fff\` to \`${FIGURE}\`, matching the app's \`--text\`.

Regenerate with \`npm run art\`; see \`scripts/match-exercise-illustrations.mjs\`.
`

function renderLookup(matched) {
  const entries = Object.keys(matched)
    .sort()
    .map((id) => `  '${id}': '${matched[id]}',`)
    .join('\n')

  return `/**
 * Generated by scripts/match-exercise-illustrations.mjs — do not hand-edit.
 * Maps this app's seed exercise ids to a drawing in public/exercise-art/, from
 * Workout Guide (https://github.com/bryllim/workout-guide, CC BY-SA 4.0).
 * Re-run \`npm run art\` after editing src/db/seed.ts.
 */
export const EXERCISE_ART: Record<string, string> = {
${entries}
}
`
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Fetching the Workout Guide manifest…')
  const manifest = await fetchWithRetry(MANIFEST_URL, false)
  const catalog = manifest.map((e) => {
    const t = tokenize(e.name)
    return { ...e, tokens: new Set(t), tokenCount: t.length }
  })
  console.log(`Loaded ${catalog.length} drawings.`)

  const seedText = await readFile(join(ROOT, 'src/db/seed.ts'), 'utf8')
  const rows = parseSeedRows(seedText)
  console.log(`Parsed ${rows.length} seed exercises.`)

  const { matched, unmatched } = match(rows, catalog)
  const slugs = [...new Set(Object.values(matched))].sort()
  console.log(`Matched ${Object.keys(matched).length} / ${rows.length} exercises to ${slugs.length} drawings.`)

  const { written, skipped, bytes } = await downloadFrames(slugs)
  console.log(`wrote ${written} frames (${(bytes / 1024 / 1024).toFixed(1)} MB), skipped ${skipped} already on disk`)

  await writeFile(join(ART_DIR, 'LICENSE.md'), LICENSE)
  console.log('wrote public/exercise-art/LICENSE.md')

  await writeFile(join(ROOT, 'src/db/exerciseArt.ts'), renderLookup(matched))
  console.log('wrote src/db/exerciseArt.ts')

  console.log(`\nNo drawing for ${unmatched.length}:`)
  for (const name of unmatched) console.log(`  - ${name}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
