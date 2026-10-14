// The chill scenes' canvas: SCALE times finer than the block canvas, with
// alpha. Where the terminal shows pictures (kitty, Ghostty) it is sent whole
// as an RGBA image; elsewhere each block pixel is the average of the fine
// pixels under it, so the same drawing works in plain cells too.

import type { Overlay } from './raster'
import { EMPTY, createCanvas, mix, packCanvas, plot, toBase64 } from './raster'

// Fine pixels per block pixel, each way: a cell is SCALE wide, 2 * SCALE tall.
export const SCALE = 4

export type Fine = {
  width: number
  height: number
  colors: Int32Array
  alpha: Float32Array
}

export const createFine = (columns: number, rows: number): Fine => {
  const width = columns * SCALE
  const height = rows * 2 * SCALE

  return { width, height, colors: new Int32Array(width * height).fill(EMPTY), alpha: new Float32Array(width * height) }
}

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

// The block cells: each block pixel the average of the fine ones under it,
// faint ones drawn as shade glyphs, the words as text.
export const fineCells = (fine: Fine, overlays: readonly Overlay[] = []) => {
  const columns = fine.width / SCALE
  const canvas = createCanvas(columns, fine.height / SCALE / 2)

  for (let y = 0; y < canvas.pixelRows; y++) {
    for (let x = 0; x < columns; x++) {
      let r = 0
      let g = 0
      let b = 0
      let weight = 0

      for (let dy = 0; dy < SCALE; dy++) {
        for (let dx = 0; dx < SCALE; dx++) {
          const at = (y * SCALE + dy) * fine.width + x * SCALE + dx
          const color = fine.colors[at]!
          const alpha = color === EMPTY ? 0 : fine.alpha[at]!
          r += ((color >> 16) & 0xff) * alpha
          g += ((color >> 8) & 0xff) * alpha
          b += (color & 0xff) * alpha
          weight += alpha
        }
      }

      const coverage = weight / (SCALE * SCALE)
      if (coverage >= 0.3) {
        const color = (Math.round(r / weight) << 16) | (Math.round(g / weight) << 8) | Math.round(b / weight)
        plot(canvas, x, y, color, coverage < 0.6)
      }
    }
  }

  return packCanvas(canvas, overlays)
}
