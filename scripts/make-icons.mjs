// Generates the PWA icons as real PNGs with no image dependencies.
// Run with: node scripts/make-icons.mjs
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [11, 13, 18, 255]
const FG = [79, 140, 255, 255]

/** Dumbbell geometry expressed in a 512×512 space, scaled per output size. */
const SHAPES = [
  [150, 234, 362, 278], // bar
  [116, 190, 152, 322], // left inner plate
  [360, 190, 396, 322], // right inner plate
  [84, 214, 116, 298], // left outer plate
  [396, 214, 428, 298], // right outer plate
]

function render(size) {
  const scale = size / 512
  const px = Buffer.alloc(size * size * 4)
  for (let i = 0; i < size * size; i++) px.set(BG, i * 4)

  for (const [x0, y0, x1, y1] of SHAPES) {
    const sx0 = Math.round(x0 * scale)
    const sy0 = Math.round(y0 * scale)
    const sx1 = Math.round(x1 * scale)
    const sy1 = Math.round(y1 * scale)
    for (let y = sy0; y < sy1; y++) {
      for (let x = sx0; x < sx1; x++) {
        if (x < 0 || y < 0 || x >= size || y >= size) continue
        px.set(FG, (y * size + x) * 4)
      }
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
