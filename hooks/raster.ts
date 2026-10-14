// Shared by the animations: colour maths, noise, and packing into Raster
// cells ([codePoint, fg, bg] little-endian u32 triplets, base64).

export const TERMINAL_DEFAULT = 0x01000000
export const EMPTY = -1

const HALF_TOP = 0x2580 // ▀
const HALF_BOTTOM = 0x2584 // ▄
const SOFT_LIGHT = 0x2591 // ░
const SOFT_DENSE = 0x2592 // ▒

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value))

export const mix = (from: number, to: number, amount: number) => {
  const t = clamp(amount, 0, 1)
  const channel = (shift: number) => {
    const a = (from >> shift) & 0xff
    const b = (to >> shift) & 0xff

    return Math.round(a + (b - a) * t) << shift
  }

  return channel(16) | channel(8) | channel(0)
}

// Deterministic noise in [0, 1) for a column and a time step.
export const noise = (x: number, step: number) => {
  let hash = Math.imul(x, 374761393) + Math.imul(step, 668265263)
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177)

  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296
}

export const toBase64 = (bytes: Uint8Array) => {
  let out = ''

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const triple = (a << 16) | (b << 8) | c

    out += BASE64[(triple >> 18) & 63]
    out += BASE64[(triple >> 12) & 63]
    out += i + 1 < bytes.length ? BASE64[(triple >> 6) & 63] : '='
    out += i + 2 < bytes.length ? BASE64[triple & 63] : '='
  }

  return out
}

// A pixel canvas two pixel rows per cell tall. `soft` pixels (smoke) draw
// as shade glyphs when nothing solid shares their cell.
export type Canvas = {
  columns: number
  pixelRows: number
  colors: Int32Array
  soft: Uint8Array
}

export const createCanvas = (columns: number, rows: number): Canvas => ({
  columns,
  pixelRows: rows * 2,
  colors: new Int32Array(columns * rows * 2).fill(EMPTY),
  soft: new Uint8Array(columns * rows * 2),
})

export const plot = (canvas: Canvas, x: number, y: number, color: number, isSoft = false) => {
  const column = Math.round(x)
  const row = Math.round(y)

  if (column < 0 || column >= canvas.columns || row < 0 || row >= canvas.pixelRows) {
    return
  }

  canvas.colors[row * canvas.columns + column] = color
  canvas.soft[row * canvas.columns + column] = isSoft ? 1 : 0
}

export const plotSprite = (
  canvas: Canvas,
  sprite: readonly string[],
  palette: Readonly<Record<string, number>>,
  left: number,
  top: number,
) => {
  sprite.forEach((line, y) => {
    ;[...line].forEach((pixel, x) => {
      const color = palette[pixel]

      if (color !== undefined) {
        plot(canvas, left + x, top + y, color)
      }
    })
  })
}

export const mirror = (sprite: readonly string[]) =>
  sprite.map(line => [...line].reverse().join(''))

// Text laid over the pixels, one width-1 character per cell.
export type Overlay = { column: number; row: number; text: string; color: number }

export const packCanvas = (canvas: Canvas, overlays: readonly Overlay[] = []) => {
  const { columns, colors, soft } = canvas
  const rows = canvas.pixelRows / 2
  const words = new Uint32Array(columns * rows * 3)

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const upper = row * 2 * columns + column
      const lower = (row * 2 + 1) * columns + column
      const upperColor = colors[upper] ?? EMPTY
      const lowerColor = colors[lower] ?? EMPTY
      const isSoftOnly =
        (upperColor === EMPTY || soft[upper] === 1) && (lowerColor === EMPTY || soft[lower] === 1)
      const at = (row * columns + column) * 3

      let glyph = 0x20
      let fg = TERMINAL_DEFAULT
      let bg = TERMINAL_DEFAULT

      if (upperColor === EMPTY && lowerColor === EMPTY) {
        // nothing here
      } else if (isSoftOnly) {
        glyph = upperColor !== EMPTY && lowerColor !== EMPTY ? SOFT_DENSE : SOFT_LIGHT
        fg = upperColor !== EMPTY ? upperColor : lowerColor
      } else if (upperColor === EMPTY) {
        glyph = HALF_BOTTOM
        fg = lowerColor
      } else {
        glyph = HALF_TOP
        fg = upperColor
        bg = lowerColor === EMPTY ? TERMINAL_DEFAULT : lowerColor
      }

      words[at] = glyph
      words[at + 1] = fg
      words[at + 2] = bg
    }
  }

  for (const { column, row, text, color } of overlays) {
    ;[...text].forEach((character, offset) => {
      const x = column + offset

      if (x < 0 || x >= columns || row < 0 || row >= rows) {
        return
      }

      const at = (row * columns + x) * 3
      words[at] = character.codePointAt(0) ?? 0x20
      words[at + 1] = color
      words[at + 2] = TERMINAL_DEFAULT
    })
  }

  return toBase64(new Uint8Array(words.buffer))
}
