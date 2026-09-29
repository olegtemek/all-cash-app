import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = join(here, '..', 'public')

const start = [10, 132, 255]
const end = [88, 86, 214]

function mix(t) {
  return start.map((channel, index) => Math.round(channel + (end[index] - channel) * t))
}

function roundedRectDistance(x, y, left, top, right, bottom, radius) {
  const dx = Math.max(left + radius - x, 0, x - (right - radius))
  const dy = Math.max(top + radius - y, 0, y - (bottom - radius))
  return Math.hypot(dx, dy) - radius
}

function coverage(distance, softness = 1) {
  return Math.min(Math.max(0.5 - distance / softness, 0), 1)
}

function drawIcon(size, { padding }) {
  const pixels = Buffer.alloc(size * size * 4)
  const scale = size / 512
  const inset = padding * scale

  const plateLeft = inset
  const plateTop = inset
  const plateRight = size - inset
  const plateBottom = size - inset
  const plateRadius = 114 * scale * (1 - (padding / 512) * 0.6)

  const cardLeft = 104 * scale
  const cardTop = 150 * scale
  const cardRight = 408 * scale
  const cardBottom = 362 * scale
  const cardRadius = 34 * scale
  const stroke = 28 * scale

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4

      const plate = coverage(roundedRectDistance(x, y, plateLeft, plateTop, plateRight, plateBottom, plateRadius))
      if (plate <= 0) continue

      const [r, g, b] = mix((x / size + y / size) / 2)

      const cardEdge = Math.abs(roundedRectDistance(x, y, cardLeft, cardTop, cardRight, cardBottom, cardRadius))
      const inCard = roundedRectDistance(x, y, cardLeft, cardTop, cardRight, cardBottom, cardRadius) < 0

      const magneticStripe = inCard && Math.abs(y - 220 * scale) < stroke / 2
      const numberStripe =
        inCard &&
        Math.abs(y - 300 * scale) < (24 * scale) / 2 &&
        x > 160 * scale &&
        x < 232 * scale

      const white = cardEdge < stroke / 2 || magneticStripe || numberStripe

      pixels[offset] = white ? 255 : r
      pixels[offset + 1] = white ? 255 : g
      pixels[offset + 2] = white ? 255 : b
      pixels[offset + 3] = Math.round(plate * 255)
    }
  }

  return pixels
}

function crc32(buffer) {
  let crc = ~0
  for (const byte of buffer) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
    }
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)

  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const checksum = Buffer.alloc(4)
  checksum.writeUInt32BE(crc32(body))

  return Buffer.concat([length, body, checksum])
}

function encodePNG(size, pixels) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  header[10] = 0
  header[11] = 0
  header[12] = 0

  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

const icons = [
  { name: 'icon-192.png', size: 192, padding: 0 },
  { name: 'icon-512.png', size: 512, padding: 0 },
  { name: 'icon-512-maskable.png', size: 512, padding: 56 },
  { name: 'apple-touch-icon.png', size: 180, padding: 0 }
]

for (const icon of icons) {
  const pixels = drawIcon(icon.size, { padding: icon.padding })
  writeFileSync(join(publicDir, icon.name), encodePNG(icon.size, pixels))
  console.log(`${icon.name} — ${icon.size}×${icon.size}`)
}
