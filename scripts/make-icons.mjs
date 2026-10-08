// Generates the PWA icons as real PNGs with no image dependencies.
// Run with: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

// These mirror the light theme's --accent and --bg in src/index.css: the icon
// is the accent colour with the glyph cut out in the page colour. Nothing
// enforces that, so they have to be changed by hand when the palette moves —
// they were missed when the app went from blue to ember, which left a blue icon
// sitting on a home screen in front of an orange app.
const BG = [181, 64, 14, 255] // #b5400e, the fill behind the glyph
const FG = [242, 236, 226, 255] // #f2ece2, the glyph

// The "t" from the wordmark: a monoline stroke with round ends, in the
// wordmark's own coordinate space (stroke 26). Keep in step with the t in
// public/trana-wordmark.svg if that glyph is ever redrawn.
const STROKE = 26
const GLYPH_CENTRE = [26, 68] // centre of the t's ink, so it can be centred on the icon
const GLYPH_HEIGHT = 130 // ink height, cap to baseline including the stroke
// Share of the icon the glyph's height may fill. The 512 icon doubles as the
// maskable icon, whose safe zone is the central 80%, so this stays well inside.
const FILL = 0.56

function sampleQuad([x0, y0], [cx, cy], [x1, y1], steps = 48) {
  const pts = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const u = 1 - t
    pts.push([u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1])
  }
  return pts
}

/** Centrelines as polylines: the stem curving into the foot, and the crossbar. */
const STROKES = [
  [[24, 16], [24, 96], ...sampleQuad([24, 96], [24, 120], [50, 120]).slice(1)],
  [[2, 48], [46, 48]],
]

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

function render(size) {
  const px = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) px.set(BG, i * 4)

  // Work in glyph units: map each pixel centre back into wordmark space so the
  // stroke radius and edge softness need no per-size tuning.
  const unitsPerPx = GLYPH_HEIGHT / (size * FILL)
  const radius = STROKE / 2
  const softness = unitsPerPx // one output pixel of antialiasing, in glyph units

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = GLYPH_CENTRE[0] + (x + 0.5 - size / 2) * unitsPerPx
      const gy = GLYPH_CENTRE[1] + (y + 0.5 - size / 2) * unitsPerPx

      let d = Infinity
      for (const line of STROKES) {
        for (let i = 1; i < line.length; i++) d = Math.min(d, distToSegment(gx, gy, line[i - 1], line[i]))
      }

      const cover = Math.max(0, Math.min(1, (radius - d) / softness + 0.5))
      if (cover === 0) continue
      const o = (y * size + x) * 4
      for (let c = 0; c < 3; c++) px[o + c] = Math.round(BG[c] + (FG[c] - BG[c]) * cover)
    }
  }
  return px
}

function crc32(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function toPng(size, pixels) {
  // Each scanline is prefixed with filter type 0 (none).
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync(OUT_DIR, { recursive: true })
for (const [name, size] of [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['apple-touch-icon.png', 180],
]) {
  writeFileSync(join(OUT_DIR, name), toPng(size, render(size)))
  console.log(`wrote public/${name} (${size}×${size})`)
}
