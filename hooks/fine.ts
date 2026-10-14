// The chill scenes' canvas: SCALE times finer than the block canvas, with
// alpha. Where the terminal shows pictures (kitty, Ghostty) it is sent whole
// as an RGBA image. Elsewhere it is drawn in quadrant blocks: each cell split
// 2x2, its four quarters fitted to the two colours that suit them best.

import type { Overlay } from './raster'
import { EMPTY, TERMINAL_DEFAULT, mix, toBase64 } from './raster'

// Fine pixels per block pixel, each way: a cell is SCALE wide, 2 * SCALE tall.
export const SCALE = 4

export type Fine = {
  width: number
  height: number
  colors: Int32Array
  alpha: Float32Array
  // Bound for quadrant cells rather than a picture: characters are drawn at
  // block size, snapped to the cells, so they stay crisp.
  forText: boolean
}

export const createFine = (columns: number, rows: number, forText = false): Fine => {
  const width = columns * SCALE
  const height = rows * 2 * SCALE

  return { width, height, colors: new Int32Array(width * height).fill(EMPTY), alpha: new Float32Array(width * height), forText }
}

// A quadrant's size in fine pixels: half a cell each way.
const QUARTER_WIDTH = SCALE / 2
const QUARTER_HEIGHT = SCALE

// Snaps a fine position to the quadrant grid when drawing for text.
export const snapX = (fine: Fine, x: number) => (fine.forText ? Math.round(x / QUARTER_WIDTH) * QUARTER_WIDTH : x)
export const snapY = (fine: Fine, y: number) => (fine.forText ? Math.round(y / QUARTER_HEIGHT) * QUARTER_HEIGHT : y)

// Lays `color` over the pixel at `amount` opacity (1 replaces it).
export const dot = (fine: Fine, x: number, y: number, color: number, amount = 1) => {
  const column = Math.round(x)
  const row = Math.round(y)

  if (column < 0 || column >= fine.width || row < 0 || row >= fine.height || amount <= 0) {
    return
  }

  const at = row * fine.width + column
  const under = fine.colors[at]!

  if (amount >= 1 || under === EMPTY) {
    fine.colors[at] = color
    fine.alpha[at] = amount >= 1 ? 1 : Math.max(fine.alpha[at]!, amount)
    return
  }

  fine.colors[at] = mix(under, color, amount)
  fine.alpha[at] = fine.alpha[at]! + amount * (1 - fine.alpha[at]!)
}

export const rect = (fine: Fine, left: number, top: number, width: number, height: number, color: number, amount = 1) => {
  for (let y = Math.round(top); y < Math.round(top + height); y++) {
    for (let x = Math.round(left); x < Math.round(left + width); x++) {
      dot(fine, x, y, color, amount)
    }
  }
}

// A filled disc; `squash` < 1 flattens it into an ellipse.
export const disc = (fine: Fine, cx: number, cy: number, radius: number, color: number, amount = 1, squash = 1) => {
  const tall = radius * squash
  for (let y = Math.floor(cy - tall); y <= Math.ceil(cy + tall); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = (x - cx) / radius
      const dy = (y - cy) / Math.max(0.5, tall)
      if (dx * dx + dy * dy <= 1) {
        dot(fine, x, y, color, amount)
      }
    }
  }
}

// A soft glow: strongest at the centre, gone at `radius`.
export const glow = (fine: Fine, cx: number, cy: number, radius: number, color: number, strength = 0.6, squash = 1) => {
  const tall = radius * squash
  for (let y = Math.floor(cy - tall); y <= Math.ceil(cy + tall); y++) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
      const dx = (x - cx) / radius
      const dy = (y - cy) / Math.max(0.5, tall)
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance < 1) {
        dot(fine, x, y, color, strength * (1 - distance) * (1 - distance))
      }
    }
  }
}

export const line = (fine: Fine, x0: number, y0: number, x1: number, y1: number, color: number, amount = 1) => {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))))
  for (let step = 0; step <= steps; step++) {
    dot(fine, x0 + ((x1 - x0) * step) / steps, y0 + ((y1 - y0) * step) / steps, color, amount)
  }
}

// A vertical gradient across the whole width, from `top` to `bottom`.
export const gradient = (fine: Fine, top: number, bottom: number, from: number, to: number) => {
  for (let y = Math.max(0, Math.round(top)); y < Math.min(fine.height, Math.round(bottom)); y++) {
    const color = mix(from, to, (y - top) / Math.max(1, bottom - top - 1))
    for (let x = 0; x < fine.width; x++) {
      dot(fine, x, y, color)
    }
  }
}

// A block sprite drawn `scale` fine pixels to the block pixel.
export const sprite = (fine: Fine, rows: readonly string[], palette: Readonly<Record<string, number>>, left: number, top: number, scale = SCALE) => {
  rows.forEach((row, y) => {
    ;[...row].forEach((pixel, x) => {
      const color = palette[pixel]
      if (color !== undefined) {
        rect(fine, left + x * scale, top + y * scale, scale, scale, color)
      }
    })
  })
}

// A 3x5 pixel font for the words laid over a picture.
const FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', J: '001001001101010', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '010101101101010', P: '110101110100100',
  Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111', '0': '111101101101111', '1': '010110010010111',
  '2': '110001010100111', '3': '110001010001110', '4': '101101111001001', '5': '111100110001110',
  '6': '011100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001110',
  '!': '010010010000010', '?': '110001010000010', '.': '000000000000010', ',': '000000000010100',
  "'": '010010000000000', '-': '000000111000000', ':': '000010000010000', '*': '000101010101000',
}

const drawText = (fine: Fine, { column, row, text, color }: Overlay) => {
  ;[...text.toUpperCase()].forEach((character, offset) => {
    const glyph = FONT[character]
    const left = (column + offset) * SCALE
    const top = row * 2 * SCALE + Math.floor((2 * SCALE - 5) / 2)
    if (glyph === undefined) {
      return
    }

    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 3; x++) {
        if (glyph[y * 3 + x] === '1') {
          dot(fine, left + x + 1, top + y + 1, 0x141414, 0.7)
          dot(fine, left + x, top + y, color)
        }
      }
    }
  })
}

// The picture: RGBA bytes, the words drawn in.
export const finePicture = (fine: Fine, overlays: readonly Overlay[] = []) => {
  for (const overlay of overlays) {
    drawText(fine, overlay)
  }

  const bytes = new Uint8Array(fine.width * fine.height * 4)
  for (let at = 0; at < fine.width * fine.height; at++) {
    const color = fine.colors[at]!
    if (color === EMPTY) {
      continue
    }
    bytes[at * 4] = (color >> 16) & 0xff
    bytes[at * 4 + 1] = (color >> 8) & 0xff
    bytes[at * 4 + 2] = color & 0xff
    bytes[at * 4 + 3] = Math.round(fine.alpha[at]! * 255)
  }

  return { rgba: toBase64(bytes), width: fine.width, height: fine.height }
}

// Quadrant glyphs by which quarters are drawn in the foreground colour:
// 1 top left, 2 top right, 4 bottom left, 8 bottom right.
const QUADRANTS = [
  0x20, 0x2598, 0x259d, 0x2580, 0x2596, 0x258c, 0x259e, 0x259b, 0x2597, 0x259a, 0x2590, 0x259c, 0x2584, 0x2599, 0x259f, 0x2588,
]

// The average colour of one quarter of a cell, or EMPTY where little is drawn.
const quarterColor = (fine: Fine, left: number, top: number) => {
  let r = 0
  let g = 0
  let b = 0
  let weight = 0

  for (let dy = 0; dy < QUARTER_HEIGHT; dy++) {
    for (let dx = 0; dx < QUARTER_WIDTH; dx++) {
      const at = (top + dy) * fine.width + left + dx
      const color = fine.colors[at]!
      const alpha = color === EMPTY ? 0 : fine.alpha[at]!
      r += ((color >> 16) & 0xff) * alpha
      g += ((color >> 8) & 0xff) * alpha
      b += (color & 0xff) * alpha
      weight += alpha
    }
  }

  if (weight < QUARTER_WIDTH * QUARTER_HEIGHT * 0.35) {
    return EMPTY
  }

  return (Math.round(r / weight) << 16) | (Math.round(g / weight) << 8) | Math.round(b / weight)
}

const channels = (color: number) => [(color >> 16) & 0xff, (color >> 8) & 0xff, color & 0xff] as const

const average = (colors: readonly number[]) => {
  let r = 0
  let g = 0
  let b = 0
  for (const color of colors) {
    const [cr, cg, cb] = channels(color)
    r += cr
    g += cg
    b += cb
  }
  return (Math.round(r / colors.length) << 16) | (Math.round(g / colors.length) << 8) | Math.round(b / colors.length)
}

const distance = (a: number, b: number) => {
  const [ar, ag, ab] = channels(a)
  const [br, bg, bb] = channels(b)
  return (ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2
}

// A cell's glyph and colours: its four quarters split into the two groups
// that keep each nearest its group's colour.
const fitCell = (quarters: readonly number[]): [number, number, number] => {
  const drawn = quarters.filter(color => color !== EMPTY)
  if (drawn.length === 0) {
    return [0x20, TERMINAL_DEFAULT, TERMINAL_DEFAULT]
  }

  // Empty quarters show the terminal behind; the rest share one colour.
  if (drawn.length < 4) {
    const mask = quarters.reduce((bits, color, index) => (color === EMPTY ? bits : bits | (1 << index)), 0)
    return [QUADRANTS[mask]!, average(drawn), TERMINAL_DEFAULT]
  }

  let best: [number, number, number] = [QUADRANTS[15]!, average(quarters), TERMINAL_DEFAULT]
  let bestError = quarters.reduce((error, color) => error + distance(color, best[1]), 0)

  for (let mask = 1; mask < 15; mask++) {
    const front = quarters.filter((_, index) => (mask >> index) & 1)
    const back = quarters.filter((_, index) => !((mask >> index) & 1))
    const fg = average(front)
    const bg = average(back)
    const error =
      front.reduce((sum, color) => sum + distance(color, fg), 0) + back.reduce((sum, color) => sum + distance(color, bg), 0)
    if (error < bestError - 1) {
      best = [QUADRANTS[mask]!, fg, bg]
      bestError = error
    }
  }

  return best
}

// The cells: quadrant blocks fitted to the fine pixels, the words as text.
export const fineCells = (fine: Fine, overlays: readonly Overlay[] = []) => {
  const columns = fine.width / SCALE
  const rows = fine.height / SCALE / 2
  const words = new Uint32Array(columns * rows * 3)

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const left = column * SCALE
      const top = row * 2 * SCALE
      const quarters = [
        quarterColor(fine, left, top),
        quarterColor(fine, left + QUARTER_WIDTH, top),
        quarterColor(fine, left, top + QUARTER_HEIGHT),
        quarterColor(fine, left + QUARTER_WIDTH, top + QUARTER_HEIGHT),
      ]
      words.set(fitCell(quarters), (row * columns + column) * 3)
    }
  }

  for (const { column, row, text, color } of overlays) {
    ;[...text].forEach((character, offset) => {
      const x = column + offset
      if (x >= 0 && x < columns && row >= 0 && row < rows) {
        words.set([character.codePointAt(0) ?? 0x20, color, TERMINAL_DEFAULT], (row * columns + x) * 3)
      }
    })
  }

  return toBase64(new Uint8Array(words.buffer))
}
