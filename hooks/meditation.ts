// chill-meditation: Clawd sits cross-legged in the middle of the band and
// meditates. Over the acts the calm deepens: eyes close, breath ripples out
// across the floor, a soft aura and fireflies, then Clawd floats, stones
// rise around it, and at last the aura burns gold.

import type { Act } from './acts'
import { HERO_PALETTE } from './hero'
import type { Fine } from './fine'
import { SCALE, createFine, disc, dot, fineCells, finePicture, glow, gradient, line, rect } from './fine'
import { clamp, mix, noise } from './raster'

// Sitting, eyes shut, arms folded in, legs tucked out to the sides.
const SITTING = ['.oooooooooo.', '.oooooooooo.', '.ooKooooKoo.', 'oooooooooooo', '.oooooooooo.', 'oo.o....o.oo']
const EYES_OPEN = ['.oooooooooo.', '.ooKooooKoo.', ...SITTING.slice(2)]
const SIT_WIDTH = 12

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

// How high Clawd floats, in pixels: from act 3, easing up and bobbing.
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

// Clawd's rows and where each sits: the in-breath lifts the top of his head.
const placed = (sprite: readonly string[], top: number, breath: number) => [
  { row: sprite[0]!, y: top - breath },
  { row: sprite[1]!, y: top + 1 - breath },
  { row: sprite[1]!, y: top + 1 },
  ...sprite.slice(2).map((row, index) => ({ row, y: top + 2 + index })),
]

// Clawd is drawn this many fine pixels to his pixel.
const UNIT = 3
// Fine rows: the far edge of the garden, and how far the aura reaches.
const HORIZON = 27
const REACH = 5

const SKY = [
  { top: 0x2b2550, low: 0xc98aa6 },
  { top: 0x1a1a40, low: 0x8a6a9a },
  { top: 0x0d1030, low: 0x3a3a6a },
]

// The sky deepens from dusk into night over the acts.
const skyOf = (scene: Meditation) => {
  const night = clamp((scene.act + Math.min(1, scene.actSeconds / 6)) / 4, 0, 1)
  const from = night < 0.5 ? SKY[0]! : SKY[1]!
  const to = night < 0.5 ? SKY[1]! : SKY[2]!
  const t = night < 0.5 ? night * 2 : (night - 0.5) * 2
  return { top: mix(from.top, to.top, t), low: mix(from.low, to.low, t), night }
}

const drawBackdrop = (fine: Fine, scene: Meditation) => {
  const sky = skyOf(scene)
  const center = fine.width / 2
  gradient(fine, 0, HORIZON, sky.top, sky.low)

  for (let x = 0; x < fine.width; x += 3) {
    if (noise(x, 5) > 0.9 && noise(x, 6) < sky.night) {
      dot(fine, x, 1 + noise(x, 8) * 14, 0xd8dcff, 0.3 + 0.5 * noise(x, Math.floor(scene.seconds * 2)))
    }
  }

  // The moon rises over the mountains as the evening goes on.
  const moonX = center + fine.width * 0.2
  const moonY = 22 - sky.night * 14
  glow(fine, moonX, moonY, 26, 0xfff4d8, 0.2 + sky.night * 0.2)
  disc(fine, moonX, moonY, 7, mix(0xfff4d8, sky.low, 0.15))
  disc(fine, moonX + 2, moonY - 2, 1.6, mix(0xfff4d8, 0xc8b8a0, 0.4), 0.5)
  disc(fine, moonX - 3, moonY + 2, 1.2, mix(0xfff4d8, 0xc8b8a0, 0.4), 0.4)

  // Misty mountains, two layers.
  for (const [rate, base, color, amount] of [[0.031, HORIZON - 4, 0x6a5a8a, 0.55], [0.057, HORIZON, 0x3a3060, 0.8]] as const) {
    for (let x = 0; x < fine.width; x++) {
      const height = 5 + 4 * Math.sin(x * rate + base) + 2 * Math.sin(x * rate * 2.7)
      for (let y = Math.floor(base - height); y < HORIZON; y++) {
        dot(fine, x, y, mix(color, sky.top, sky.night * 0.4), amount)
      }
    }
  }
}

// Raked sand: gentle lines curving around the stone Clawd sits on.
const drawGarden = (fine: Fine, scene: Meditation) => {
  const center = fine.width / 2
  const night = skyOf(scene).night
  const sand = mix(0xd8cdb4, 0x5a5670, night * 0.8)
  const groove = mix(sand, 0x000000, 0.18)

  for (let y = HORIZON; y < fine.height; y++) {
    for (let x = 0; x < fine.width; x++) {
      const dx = (x - center) / 30
      const dy = (y - (fine.height - 3)) / 6
      const ring = Math.sqrt(dx * dx + dy * dy)
      const rake = ring < 1.6 ? Math.sin(ring * 9) : Math.sin(y * 1.6 + Math.sin(x * 0.05) * 0.8)
      dot(fine, x, y, rake > 0.6 ? groove : noise(x, y) > 0.93 ? mix(sand, 0xffffff, 0.15) : sand)
    }
  }

  // The breath ripples out across the sand.
  for (const ripple of scene.ripples) {
    const radius = SIT_WIDTH * UNIT * 0.6 + (ripple.age / RIPPLE_SECONDS) * fine.width * 0.35
    const fade = 1 - ripple.age / (RIPPLE_SECONDS * 1.5)
    for (let angle = 0; angle < Math.PI * 2; angle += 0.5 / radius) {
      dot(fine, center + Math.cos(angle) * radius, fine.height - 4 + Math.sin(angle) * radius * 0.12, RIPPLE, 0.7 * fade)
    }
  }

  disc(fine, center, fine.height - 4, SIT_WIDTH * UNIT * 0.62, mix(0x7a7a84, 0x2a2a3a, night * 0.6), 1, 0.16)
  disc(fine, center - 4, fine.height - 5, SIT_WIDTH * UNIT * 0.4, mix(0x9a9aa4, 0x3a3a4a, night * 0.6), 0.6, 0.1)
}

// Stone lanterns either side, lit once the meditation deepens.
const drawLanterns = (fine: Fine, scene: Meditation) => {
  const night = skyOf(scene).night
  const stone = mix(0x8a8f99, 0x3a3e4a, night * 0.7)
  const flicker = 0.8 + 0.2 * noise(1, Math.floor(scene.seconds * 8))

  for (const x of [fine.width * 0.14, fine.width * 0.86]) {
    const ground = fine.height - 2
    rect(fine, x - 3, ground - 2, 7, 2, stone)
    rect(fine, x - 1, ground - 8, 3, 6, stone)
    rect(fine, x - 3, ground - 12, 7, 4, stone)
    rect(fine, x - 5, ground - 14, 11, 2, mix(stone, 0x000000, 0.15))
    rect(fine, x - 1, ground - 16, 3, 2, stone)
    if (scene.act >= 1) {
      rect(fine, x - 2, ground - 11, 5, 2, mix(0xffb347, 0xfff2b0, flicker))
      glow(fine, x, ground - 10, 14, 0xffb347, 0.35 * flicker)
    }
  }
}

// How tall the gold flame stands over fine column `x`: tongues across the top
// of Clawd's head, tallest in the middle, smoothed between neighbours.
const flameHeight = (x: number, step: number, box: { left: number; right: number }) => {
  const across = (x - box.left) / (box.right - box.left)
  if (across < 0 || across > 1) {
    return 0
  }
  const lick = (noise(Math.floor(x / 3), step) + noise(Math.floor(x / 3) + 1, step)) / 2
  return (4 + lick * 10) * Math.sin(across * Math.PI) ** 0.6
}

// The aura: a glow hugging Clawd's outline, cool and soft at first; gold, with
// flames licking up off it, in act 4.
const drawAura = (fine: Fine, scene: Meditation, body: Set<number>, box: { left: number; top: number; right: number; bottom: number }) => {
  const isGold = scene.act >= 4
  const colors = isGold ? GOLD : CALM
  const step = Math.floor(scene.seconds * 12)

  for (let y = box.top - REACH - 10; y <= box.bottom + REACH; y++) {
    for (let x = box.left - REACH; x <= box.right + REACH; x++) {
      if (body.has(y * fine.width + x)) {
        continue
      }

      let distance = Infinity
      for (let dy = -REACH; dy <= REACH && distance > 1; dy++) {
        for (let dx = -REACH; dx <= REACH; dx++) {
          if (body.has((y + dy) * fine.width + x + dx)) {
            distance = Math.min(distance, Math.sqrt(dx * dx + dy * dy))
          }
        }
      }

      // Flames rise off the top of the glow: tongues that taper and flicker.
      const tongue = isGold && y < box.top + 2 ? flameHeight(x, step, box) : 0
      const above = box.top + 2 - y
      if (tongue > 0 && above > 0 && above < tongue) {
        const heat = above / tongue
        dot(fine, x + Math.sin(scene.seconds * 12 + y * 0.6) * heat, y, heat < 0.4 ? 0xfff2b0 : heat < 0.75 ? 0xffc23a : 0xff7a1a, 0.95 - heat * 0.55)
        continue
      }
      if (distance > REACH) {
        continue
      }

      const near = 1 - distance / (REACH + 1)
      const shimmer = 0.5 + 0.5 * Math.sin(x * 0.4 + y * 0.5 + scene.seconds * (isGold ? 9 : 3))
      dot(fine, x, y, mix(colors[2]!, colors[0]!, near), near * (0.45 + shimmer * 0.35))
    }
  }
}

const drawMeditation = (fine: Fine, scene: Meditation) => {
  const center = fine.width / 2

  drawBackdrop(fine, scene)
  drawGarden(fine, scene)
  drawLanterns(fine, scene)

  for (const stone of scene.stones) {
    const x = stone.x * SCALE
    const y = (stone.y + 0.5 * Math.sin(scene.seconds * 2 + stone.phase)) * SCALE
    if (scene.act >= 4) {
      glow(fine, x, y, 6, 0xffd21f, 0.3)
    }
    disc(fine, x, y, 2.6, STONE, 1, 0.7)
    dot(fine, x - 1, y - 1, mix(STONE, 0xffffff, 0.4))
  }

  // Clawd, breathing and, later, floating.
  const breath = scene.act >= 1 && Math.sin((scene.seconds / BREATH_SECONDS) * Math.PI * 2) > 0 ? 1 : 0
  const sprite = scene.act === 0 && scene.seconds < 0.6 ? EYES_OPEN : SITTING
  const lift = Math.round(liftOf(scene) * 6)
  const left = Math.round(center - (SIT_WIDTH * UNIT) / 2)
  const top = fine.height - 5 - sprite.length * UNIT - lift
  const rows = placed(sprite, 0, breath)

  disc(fine, center, fine.height - 4, SIT_WIDTH * UNIT * 0.45 * (1 - lift / 12), 0x000000, 0.25, 0.12)

  const body = new Set<number>()
  const box = { left, top: top - breath * UNIT, right: left + SIT_WIDTH * UNIT, bottom: top + (sprite.length + 1) * UNIT }
  for (const { row, y } of rows) {
    ;[...row].forEach((pixel, dx) => {
      if (pixel === '.') {
        return
      }
      for (let py = 0; py < UNIT; py++) {
        for (let px = 0; px < UNIT; px++) {
          body.add((top + y * UNIT + py) * fine.width + left + dx * UNIT + px)
        }
      }
    })
  }

  if (scene.act >= 2) {
    drawAura(fine, scene, body, box)
  }

  for (const { row, y } of rows) {
    ;[...row].forEach((pixel, dx) => {
      const color = HERO_PALETTE[pixel]
      if (color !== undefined) {
        rect(fine, left + dx * UNIT, top + y * UNIT, UNIT, UNIT, color)
      }
    })
  }

  if (scene.leaf !== null && scene.leaf.y * SCALE < fine.height - 4) {
    const x = scene.leaf.x * SCALE
    const y = scene.leaf.y * SCALE
    const tilt = Math.sin(scene.seconds * 3)
    line(fine, x - 2, y - tilt, x + 2, y + tilt, 0xf2a7c0)
    dot(fine, x, y - 1, 0xf7c4d6)
    dot(fine, x, y + 1, 0xe08aa8)
  }

  for (const fly of scene.fireflies) {
    const shine = 0.5 + 0.5 * Math.sin(scene.seconds * 3 * fly.speed + fly.phase)
    const x = (fly.x + 3 * Math.sin(scene.seconds * fly.speed + fly.phase)) * SCALE
    const y = (fly.y + Math.cos(scene.seconds * fly.speed)) * SCALE * 0.8
    glow(fine, x, y, 5, FIREFLY, 0.5 * shine)
    dot(fine, x, y, mix(0x88aa44, FIREFLY, shine))
  }
}

export const meditationCells = (scene: Meditation, columns: number, rows: number) => {
  const fine = createFine(columns, rows)
  drawMeditation(fine, scene)
  return fineCells(fine)
}

export const meditationPicture = (scene: Meditation, columns: number, rows: number) => {
  const fine = createFine(columns, rows)
  drawMeditation(fine, scene)
  return finePicture(fine)
}
