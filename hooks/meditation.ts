// chill-meditation: Pinch sits cross-legged in the middle of the band and
// meditates. Over the acts the calm deepens: eyes close, breath ripples out
// across the floor, a soft aura and fireflies, then Pinch floats, stones
// rise around it, and at last the aura burns gold.

import type { Act } from './acts'
import { HERO_PALETTE } from './hero'
import type { Canvas } from './raster'
import { clamp, createCanvas, mix, noise, packCanvas, plot, plotSprite } from './raster'

// Sitting, eyes shut, pincers folded in, legs tucked out to the sides.
const SITTING = ['..KK....KK..', '...o.....o..', '.oooooooooo.', 'oooooooooooo', '.oooooooooo.', 'oo.o....o.oo']
const EYES_OPEN = ['..WK....WK..', ...SITTING.slice(1)]
const SIT_WIDTH = 12

const FLOOR = 0x3a3226
const RIPPLE = 0x7fb8c8
const CALM = [0x5ec8d8, 0x8fe3ec, 0xc6f4f7]
const GOLD = [0xfffbe0, 0xffd21f, 0xe08a00]
const FIREFLY = 0xd8f27a
const STONE = 0x8a8f99

type Mote = { x: number; y: number; phase: number; speed: number }
type Ripple = { age: number }

export type Meditation = {
  act: Act
  seconds: number
  actSeconds: number
  ripples: Ripple[]
  untilRipple: number
  fireflies: Mote[]
  stones: Mote[]
  leaf: { x: number; y: number } | null
}

export const createMeditation = (): Meditation => ({
  act: 4,
  seconds: 0,
  actSeconds: 0,
  ripples: [],
  untilRipple: 0,
  fireflies: [],
  stones: [],
  leaf: null,
})

export const beginMeditation = (scene: Meditation) => {
  Object.assign(scene, createMeditation(), { act: 0 })
}

const BREATH_SECONDS = 3.2
const RIPPLE_SECONDS = 2.4

// How high Pinch floats, in pixels: from act 3, easing up and bobbing.
const liftOf = (scene: Meditation) =>
  scene.act < 3 ? 0 : Math.min(1, (scene.act === 3 ? scene.actSeconds : 1) * 0.8) * (0.7 + 0.5 * Math.sin(scene.seconds * 1.6))

export const stepMeditation = (scene: Meditation, seconds: number, columns: number, random: () => number = Math.random) => {
  const center = columns / 2
  scene.seconds += seconds
  scene.actSeconds += seconds

  // A breath, out across the floor, every few seconds from act 1.
  scene.untilRipple -= seconds
  if (scene.act >= 1 && scene.untilRipple <= 0) {
    scene.ripples.push({ age: 0 })
    scene.untilRipple = RIPPLE_SECONDS
  }
  scene.ripples = scene.ripples.filter(ripple => (ripple.age += seconds) < RIPPLE_SECONDS * 1.5)

  // A leaf drifts down once, in act 1.
  if (scene.act === 1 && scene.leaf === null && scene.actSeconds < 0.2) {
    scene.leaf = { x: center + (random() < 0.5 ? -1 : 1) * (8 + random() * 10), y: 0 }
  }
  if (scene.leaf !== null) {
    scene.leaf.y += seconds * 3
    scene.leaf.x += Math.sin(scene.seconds * 3) * seconds * 4
  }

  // Fireflies gather from act 2; stones rise from act 3.
  const fireflies = scene.act >= 2 ? Math.min(8, 2 + Math.floor(scene.actSeconds)) : 0
  while (scene.fireflies.length < fireflies) {
    scene.fireflies.push({ x: center + (random() - 0.5) * columns * 0.6, y: 1 + random() * 6, phase: random() * 6, speed: 0.5 + random() })
  }

  if (scene.act >= 3 && scene.stones.length === 0) {
    for (const side of [-1, 1, -1, 1]) {
      scene.stones.push({ x: center + side * (SIT_WIDTH / 2 + 3 + random() * 6), y: 9, phase: random() * 6, speed: 0.6 + random() * 0.6 })
    }
  }

  for (const stone of scene.stones) {
    stone.y = Math.max(3 + stone.phase / 3, stone.y - seconds * stone.speed * 2)
  }
}

// Pinch's rows and where each sits: the in-breath stretches the eye stalks,
// lifting the eyes a pixel.
const placed = (sprite: readonly string[], top: number, breath: number) => [
  { row: sprite[0]!, y: top - breath },
  { row: sprite[1]!, y: top + 1 - breath },
  { row: sprite[1]!, y: top + 1 },
  ...sprite.slice(2).map((row, index) => ({ row, y: top + 2 + index })),
]

// The aura: a glow hugging Pinch's outline, cool and soft at first; gold, with
// flames licking up off it, in act 4.
const drawAura = (canvas: Canvas, scene: Meditation, rows: ReturnType<typeof placed>, left: number) => {
  const isGold = scene.act >= 4
  const colors = isGold ? GOLD : CALM
  const reach = 1
  const step = Math.floor(scene.seconds * 12)
  const body = new Set<string>()

  for (const { row, y } of rows) {
    ;[...row].forEach((pixel, dx) => pixel !== '.' && body.add(`${left + dx},${y}`))
  }

  const top = Math.min(...rows.map(({ y }) => y))
  for (let y = top - 4; y < canvas.pixelRows - 1; y++) {
    for (let x = left - reach - 1; x <= left + SIT_WIDTH + reach; x++) {
      if (body.has(`${x},${y}`)) {
        continue
      }

      let distance = Infinity
      for (let dy = -reach; dy <= reach; dy++) {
        for (let dx = -reach; dx <= reach; dx++) {
          if (body.has(`${x + dx},${y + dy}`)) {
            distance = Math.min(distance, Math.max(Math.abs(dx), Math.abs(dy)))
          }
        }
      }

      // Flames rise from the top of the glow, flickering.
      const flame = isGold && y < top && noise(x, step) > 0.45 && y >= top - 1 - Math.round(noise(x + 31, step) * 3)
      if (distance > reach && !flame) {
        continue
      }

      const shimmer = 0.5 + 0.5 * Math.sin(x * 0.8 + y + scene.seconds * (isGold ? 9 : 3))
      const color = mix(colors[0]!, colors[2]!, flame ? 0.6 : (distance - 1) / reach + shimmer * 0.4)
      plot(canvas, x, y, color, !isGold && shimmer < 0.5)
    }
  }
}

export const meditationCells = (scene: Meditation, columns: number, rows: number) => {
  const canvas = createCanvas(columns, rows)
  const floor = canvas.pixelRows - 1
  const center = columns / 2
  const left = Math.round(center - SIT_WIDTH / 2)

  for (let x = 0; x < columns; x++) {
    plot(canvas, x, floor, FLOOR)
  }

  for (const ripple of scene.ripples) {
    const radius = (ripple.age / RIPPLE_SECONDS) * columns * 0.35
    const color = mix(RIPPLE, FLOOR, ripple.age / (RIPPLE_SECONDS * 1.5))
    plot(canvas, center - SIT_WIDTH / 2 - radius, floor, color)
    plot(canvas, center + SIT_WIDTH / 2 + radius, floor, color)
  }

  if (scene.leaf !== null && scene.leaf.y < floor) {
    plot(canvas, scene.leaf.x, scene.leaf.y, 0xd98a3a)
  }

  for (const fly of scene.fireflies) {
    const glow = 0.5 + 0.5 * Math.sin(scene.seconds * 3 * fly.speed + fly.phase)
    if (glow > 0.35) {
      plot(canvas, fly.x + 3 * Math.sin(scene.seconds * fly.speed + fly.phase), fly.y + Math.cos(scene.seconds * fly.speed), mix(0x445522, FIREFLY, glow))
    }
  }

  for (const stone of scene.stones) {
    plot(canvas, stone.x, stone.y + 0.5 * Math.sin(scene.seconds * 2 + stone.phase), STONE)
    plot(canvas, stone.x + 1, stone.y + 0.5 * Math.sin(scene.seconds * 2 + stone.phase), STONE)
  }

  // Breathing: the shell rises a pixel on the in-breath.
  const breath = scene.act >= 1 && Math.sin((scene.seconds / BREATH_SECONDS) * Math.PI * 2) > 0 ? 1 : 0
  const sprite = scene.act === 0 && scene.seconds < 0.6 ? EYES_OPEN : SITTING
  const lift = Math.round(liftOf(scene))
  const top = floor - sprite.length - lift

  const parts = placed(sprite, top, breath)

  if (scene.act >= 2) {
    drawAura(canvas, scene, parts, left)
  }

  for (const { row, y } of parts) {
    plotSprite(canvas, [row], HERO_PALETTE, left, y)
  }

  return packCanvas(canvas)
}
