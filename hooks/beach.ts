// chill-beach: Clawd's day at the beach. Over the acts: lounging under an
// umbrella in sunglasses, a gull flies over, Clawd builds a sandcastle, a big
// wave takes it as the sun sets, then night falls by a bonfire.

import type { Act } from './acts'
import type { Fine } from './fine'
import { SCALE, createFine, disc, dot, fineCells, finePicture, glow, gradient, line, rect } from './fine'
import { BODY_WIDTH, EYE_COLUMNS, EYE_ROW, drawHeroFine } from './hero'
import type { Overlay } from './raster'
import { clamp, mix, noise } from './raster'

const SAND = 0xe6c98a
const SAND_NIGHT = 0x7a6448
const SEA = 0x2f7fb5
const SEA_DUSK = 0x7a4f8a
const SEA_NIGHT = 0x1b2a4a
const FOAM = 0xe8f6ff
const SUN = 0xffe066
const SUN_DUSK = 0xff7a3d
const MOON = 0xf2f0e0
const STAR = 0xc8d0ff
const GULL = 0xf4f4f4
const SHADES = 0x141414

// How much sandcastle there is to build, in pats.
const CASTLE_PIXELS = 18
const CASTLE_COLOR = 0xd9b26f

const SEA_TOP = 5
const SAND_TOP = 8
const WALK_SPEED = 10
const BUILD_SECONDS = 3.5
const WAVE_SECONDS = 2.6
const DUSK_SECONDS = 6

export type Beach = {
  act: Act
  seconds: number
  actSeconds: number
  x: number
  castle: number
  isCastleStanding: boolean
  gull: number | null
  sparks: { x: number; y: number; age: number }[]
}

export const createBeach = (): Beach => ({
  act: 4,
  seconds: 0,
  actSeconds: 0,
  x: -1,
  castle: 0,
  isCastleStanding: false,
  gull: null,
  sparks: [],
})

export const beginBeach = (scene: Beach) => {
  Object.assign(scene, createBeach(), { act: 0 })
}

const umbrellaX = (columns: number) => Math.round(columns * 0.18)
const loungeX = (columns: number) => umbrellaX(columns) + 1
const castleX = (columns: number) => Math.round(columns * 0.42)
const fireX = (columns: number) => loungeX(columns) + 16

// How far into the sunset (0 day, 1 dusk) and whether it is night.
const duskOf = (scene: Beach) => (scene.act === 3 ? clamp(scene.actSeconds / DUSK_SECONDS, 0, 1) : scene.act >= 4 ? 1 : 0)
const isNight = (scene: Beach) => scene.act >= 4

// The big wave of act 3: how far up the sand the water reaches (0 to 1).
const swashOf = (scene: Beach) =>
  scene.act === 3 && scene.actSeconds < WAVE_SECONDS ? Math.sin((scene.actSeconds / WAVE_SECONDS) * Math.PI) : 0

export const stepBeach = (scene: Beach, seconds: number, columns: number, random: () => number = Math.random) => {
  scene.seconds += seconds
  scene.actSeconds += seconds

  if (scene.x < 0) {
    scene.x = loungeX(columns)
  }

  // A gull crosses in act 1, right to left.
  if (scene.act === 1 && scene.gull === null && scene.actSeconds < 0.2) {
    scene.gull = columns + 2
  }
  if (scene.gull !== null) {
    scene.gull -= seconds * 30
    scene.gull = scene.gull < -4 ? null : scene.gull
  }

  if (scene.act === 2) {
    // Walk out and build.
    const to = castleX(columns) - 13
    if (scene.x < to) {
      scene.x = Math.min(to, scene.x + WALK_SPEED * seconds)
    } else {
      scene.isCastleStanding = true
      scene.castle = Math.min(CASTLE_PIXELS, scene.castle + (CASTLE_PIXELS / BUILD_SECONDS) * seconds)
    }
  } else if (scene.act === 3) {
    // The wave washes the castle away; Clawd scurries back to the umbrella.
    scene.castle = Math.max(0, scene.castle - swashOf(scene) * CASTLE_PIXELS * seconds * 2)
    scene.isCastleStanding = scene.castle > 0
    scene.x = Math.max(loungeX(columns), scene.x - WALK_SPEED * 1.6 * seconds)
  } else if (scene.act >= 4) {
    scene.x = Math.max(loungeX(columns), scene.x - WALK_SPEED * 1.6 * seconds)
    scene.sparks.push({ x: fireX(columns) + 1 + (random() - 0.5) * 2, y: SAND_TOP - 1, age: 0 })
  }

  for (const spark of scene.sparks) {
    spark.age += seconds
    spark.y -= seconds * 4
  }
  scene.sparks = scene.sparks.filter(spark => spark.age < 0.8)
}

// Fine rows: the sea from the horizon, the sand from the shore.
const SEA_LINE = 14
const SAND_LINE = 27
// Clawd is drawn this many fine pixels to his pixel: small in a big world.
const UNIT = 3

const SKY = { top: 0x5fa8e8, low: 0xc4e6f7 }
const SKY_DUSK = { top: 0x3b2a6b, low: 0xff9a5a }
const SKY_NIGHT = { top: 0x070b24, low: 0x1e2a55 }

const skyOf = (scene: Beach) => {
  if (isNight(scene)) {
    return SKY_NIGHT
  }
  const dusk = duskOf(scene)
  return { top: mix(SKY.top, SKY_DUSK.top, dusk), low: mix(SKY.low, SKY_DUSK.low, dusk) }
}

// Three clouds drifting right, slowly; puffs of overlapping discs.
const drawClouds = (fine: Fine, scene: Beach) => {
  const tint = mix(0xffffff, 0xffb08a, duskOf(scene))
  const span = fine.width + 60
  for (let cloud = 0; cloud < 3; cloud++) {
    const x = ((noise(cloud, 41) * span + scene.seconds * (1.5 + cloud * 0.6)) % span) - 30
    const y = 4 + cloud * 4 + noise(cloud, 7) * 3
    const size = 3 + noise(cloud, 13) * 2
    for (const [dx, dy, r] of [[0, 1, 1], [size * 1.4, 0, 1.3], [size * 2.8, 1, 1.1], [size * 1.4, 2, 1.2], [size * 4, 2, 0.8]] as const) {
      disc(fine, x + dx, y + dy, size * r, tint, 0.85, 0.6)
    }
    rect(fine, x - size * 0.5, y + 2, size * 5, size * 0.6, mix(tint, 0x9aa7c8, 0.25), 0.5)
  }
}

const drawSky = (fine: Fine, scene: Beach) => {
  const sky = skyOf(scene)
  gradient(fine, 0, SEA_LINE, sky.top, sky.low)
  const sunX = fine.width * 0.8

  if (isNight(scene)) {
    for (let x = 0; x < fine.width; x += 2) {
      const at = Math.floor(x / 2)
      if (noise(at, 7) > 0.94) {
        const y = 1 + noise(at, 3) * (SEA_LINE - 4)
        const twinkle = 0.4 + 0.6 * noise(at, Math.floor(scene.seconds * 3))
        dot(fine, x, y, STAR, twinkle)
        if (noise(at, 17) > 0.8 && twinkle > 0.8) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
            dot(fine, x + dx, y + dy, STAR, 0.4)
          }
        }
      }
    }

    glow(fine, sunX, 8, 14, MOON, 0.25)
    disc(fine, sunX, 8, 4.5, MOON)
    disc(fine, sunX + 2.2, 6.8, 4, mix(sky.top, sky.low, 0.3))
    return
  }

  const dusk = duskOf(scene)
  const sunY = 5 + dusk * (SEA_LINE - 6)
  const sun = mix(SUN, SUN_DUSK, dusk)
  glow(fine, sunX, sunY, 18 + dusk * 10, sun, 0.45 + dusk * 0.2, 0.8)
  disc(fine, sunX, sunY, 5, sun)
  disc(fine, sunX - 1.5, sunY - 1.5, 2, mix(sun, 0xffffff, 0.5), 0.6)
  drawClouds(fine, scene)
}

const drawSea = (fine: Fine, scene: Beach) => {
  const dusk = duskOf(scene)
  const sky = skyOf(scene)
  const water = isNight(scene) ? SEA_NIGHT : mix(SEA, SEA_DUSK, dusk)
  const swash = swashOf(scene)
  const shore = SAND_LINE + swash * 8
  const top = SEA_LINE - swash * 6
  const glint = isNight(scene) ? MOON : mix(SUN, SUN_DUSK, dusk)
  const glintX = fine.width * 0.8
  const step = Math.floor(scene.seconds * 8)

  for (let y = Math.floor(top); y < shore; y++) {
    const depth = (y - top) / Math.max(1, shore - top)
    const base = mix(mix(water, sky.low, 0.35), water, Math.min(1, depth * 1.6))
    for (let x = 0; x < fine.width; x++) {
      // Swells: short horizontal streaks of light and shadow, drifting.
      const wave = Math.sin(x * (0.09 + depth * 0.05) + noise(y, 1) * 40 - scene.seconds * (1.2 + depth))
      let color = wave > 0.94 ? mix(base, FOAM, 0.35 + depth * 0.2) : wave < -0.9 ? mix(base, 0x000000, 0.12) : base
      // The sun's (or moon's) path on the water: dashes that shimmer.
      const spread = 4 + depth * 10
      const dash = Math.floor((x - glintX + 40) / 3)
      if (Math.abs(x - glintX) < spread && noise(dash * 31 + y, step) > 0.45 + (Math.abs(x - glintX) / spread) * 0.5) {
        color = mix(color, glint, 0.75)
      }
      dot(fine, x, y, color)
    }
  }

  // Foam along the waterline, the wave's edge running up the sand in act 3.
  for (let x = 0; x < fine.width; x++) {
    const edge = shore + Math.sin(x * 0.12 + scene.seconds * 1.7) * 1.2
    for (let dy = -1; dy < 2; dy++) {
      dot(fine, x, edge + dy, FOAM, dy === 0 ? 0.9 : 0.45)
    }
  }
}

const drawSand = (fine: Fine, scene: Beach) => {
  const sand = isNight(scene) ? SAND_NIGHT : mix(SAND, 0xc9905e, duskOf(scene) * 0.5)
  const shore = SAND_LINE + swashOf(scene) * 8

  for (let y = Math.ceil(shore); y < fine.height; y++) {
    const isWet = y < shore + 3
    for (let x = 0; x < fine.width; x++) {
      const grain = noise(x, y)
      const base = isWet ? mix(sand, 0x6b5233, 0.35) : sand
      dot(fine, x, y, grain > 0.9 ? mix(base, 0xffffff, 0.18) : grain < 0.08 ? mix(base, 0x000000, 0.12) : base)
    }
  }

  // A few shells and pebbles.
  for (let x = 0; x < fine.width; x += 7) {
    if (noise(x, 91) > 0.82) {
      const y = SAND_LINE + 5 + noise(x, 92) * (fine.height - SAND_LINE - 7)
      dot(fine, x, y, noise(x, 93) > 0.5 ? 0xf2c4c4 : 0x9a8f80)
      dot(fine, x + 1, y, noise(x, 93) > 0.5 ? 0xe8a8a8 : 0x8a7f70)
    }
  }
}

// A striped beach umbrella, its shadow, and the towel under it.
const drawUmbrella = (fine: Fine, columns: number, ground: number) => {
  const cx = (umbrellaX(columns) + 3.5) * SCALE
  const crown = 3
  const radius = 23

  disc(fine, cx + 4, ground - 2, radius * 0.9, 0x000000, 0.18, 0.12)

  const towel = loungeX(columns) * SCALE - 2
  for (let x = 0; x < 52; x++) {
    rect(fine, towel + x, ground - 3, 1, 2, Math.floor(x / 5) % 2 === 0 ? 0x2f7fb5 : 0xf6f0e6)
  }

  line(fine, cx, crown + 4, cx, ground - 1, 0xb0a090)
  line(fine, cx + 1, crown + 4, cx + 1, ground - 1, 0x8a7a6a)

  for (let y = crown; y <= crown + 8; y++) {
    const half = radius * Math.sqrt(Math.max(0, 1 - ((crown + 8 - y) / 8.5) ** 2))
    for (let x = Math.round(cx - half); x <= Math.round(cx + half); x++) {
      const stripe = Math.floor((x - cx + radius) / 5.75) % 2 === 0
      const shade = (x - cx) / radius > 0.4 ? 0.18 : 0
      dot(fine, x, y, mix(stripe ? 0xe0453a : 0xf6f0e6, 0x000000, shade))
    }
  }
  // Scalloped hem.
  for (let x = Math.round(cx - radius); x <= Math.round(cx + radius); x++) {
    if (Math.sin(((x - cx) / 5.75) * Math.PI) > -0.2) {
      const stripe = Math.floor((x - cx + radius) / 5.75) % 2 === 0
      dot(fine, x, crown + 9, stripe ? 0xb8352c : 0xd8d0c4)
    }
  }
  disc(fine, cx + 0.5, crown - 0.5, 1.2, 0xb8352c)
}

// The sandcastle, built up from the bottom as Clawd pats it into shape.
const drawCastle = (fine: Fine, scene: Beach, columns: number, ground: number) => {
  const left = castleX(columns) * SCALE - 2
  const bottom = ground - 2
  const height = 17
  const showFrom = bottom - (scene.castle / CASTLE_PIXELS) * height
  const lit = CASTLE_COLOR
  const dim = mix(CASTLE_COLOR, 0x5a3f1e, 0.35)
  const at = (x: number, y: number, color: number) => y >= showFrom && dot(fine, left + x, y, color)

  const block = (x0: number, width: number, top: number) => {
    for (let y = top; y < bottom; y++) {
      for (let x = x0; x < x0 + width; x++) {
        at(x, y, x >= x0 + width - 2 ? dim : noise(left + x, y) > 0.92 ? mix(lit, 0xffffff, 0.2) : lit)
      }
    }
    for (let x = x0; x < x0 + width; x += 2) {
      at(x, top - 1, x >= x0 + width - 2 ? dim : lit)
    }
  }

  block(0, 24, bottom - 8)
  block(0, 6, bottom - 13)
  block(18, 6, bottom - 13)
  block(9, 7, bottom - 16)

  for (let y = bottom - 5; y < bottom; y++) {
    for (let x = 10; x < 14; x++) {
      at(x, y, y === bottom - 5 && (x === 10 || x === 13) ? lit : 0x4a3520)
    }
  }
  for (const x of [2, 20]) {
    at(x, bottom - 10, 0x4a3520)
    at(x + 1, bottom - 10, 0x4a3520)
  }

  if (scene.castle >= CASTLE_PIXELS - 0.01) {
    const pole = left + 12
    line(fine, pole, bottom - 22, pole, bottom - 17, 0x8a7a6a)
    const wave = Math.sin(scene.seconds * 6)
    for (let dx = 1; dx <= 4; dx++) {
      dot(fine, pole + dx, bottom - 22 + Math.round(wave * dx * 0.2), 0xe0453a)
      dot(fine, pole + dx, bottom - 21 + Math.round(wave * dx * 0.2), dx < 3 ? 0xe0453a : 0xb8352c)
    }
  }
}

const drawFire = (fine: Fine, scene: Beach, columns: number, ground: number) => {
  const x = (fireX(columns) + 1.5) * SCALE
  const flicker = scene.seconds * 9

  glow(fine, x, ground - 3, 34, 0xff9a3d, 0.45, 0.35)
  glow(fine, x, ground - 8, 12, 0xffb347, 0.35)

  line(fine, x - 6, ground - 1, x + 6, ground - 4, 0x6b4226)
  line(fine, x - 6, ground - 4, x + 6, ground - 1, 0x5a3820)
  line(fine, x - 5, ground - 1, x + 5, ground - 1, 0x3a2614)

  for (let dx = -5; dx <= 5; dx++) {
    const reach = (1 - Math.abs(dx) / 6) * (7 + 5 * noise(Math.round(x) + dx, Math.floor(flicker)))
    for (let dy = 0; dy < reach; dy++) {
      const heat = dy / reach
      const color = heat < 0.35 ? 0xfff2b0 : heat < 0.65 ? 0xffb347 : 0xff5a2e
      dot(fine, x + dx + Math.sin(flicker + dy * 0.7) * heat * 1.5, ground - 3 - dy, color, 1 - heat * 0.5)
    }
  }

  for (const spark of scene.sparks) {
    const y = ground - 10 + (spark.y - (SAND_TOP - 1)) * SCALE
    dot(fine, spark.x * SCALE + Math.sin(spark.age * 20) * 1.5, y, mix(0xffe066, 0xff5a2e, spark.age / 0.8), 1 - spark.age / 0.8)
  }
}

const drawGull = (fine: Fine, scene: Beach) => {
  if (scene.gull === null) {
    return
  }

  const x = scene.gull * SCALE
  const y = 9 + Math.sin(scene.seconds * 2) * 1.5
  const flap = Math.sin(scene.seconds * 12)
  const tip = y - 3 * flap
  for (const side of [-1, 1]) {
    line(fine, x, y, x + side * 3, y - 1 - flap, GULL)
    line(fine, x + side * 3, y - 1 - flap, x + side * 6, tip, GULL)
    dot(fine, x + side * 6, tip, 0x555555)
  }
  dot(fine, x, y + 1, GULL)
  dot(fine, x - 1, y + 1, 0xffb347)
}

const drawBeach = (fine: Fine, scene: Beach, columns: number) => {
  const ground = fine.height
  const overlays: Overlay[] = []

  drawSky(fine, scene)
  drawSea(fine, scene)
  drawSand(fine, scene)
  drawUmbrella(fine, columns, ground)

  if (scene.isCastleStanding) {
    drawCastle(fine, scene, columns, ground)
  }

  if (scene.act >= 4) {
    drawFire(fine, scene, columns, ground)
  }

  // Clawd: lounging in shades, walking out, patting the castle, or fleeing the wave.
  const isBuilding = scene.act === 2 && scene.x >= castleX(columns) - 13
  const isWalking = (scene.act === 2 && !isBuilding) || (scene.act >= 3 && scene.x > loungeX(columns))
  const pose = isBuilding ? (Math.floor(scene.seconds * 4) % 2 === 0 ? 'punch' : 'idle') : isWalking && Math.floor(scene.seconds * 8) % 2 === 0 ? 'stride' : 'idle'
  const facing = scene.act >= 3 && scene.x > loungeX(columns) ? -1 : 1
  const lift = scene.act === 3 && swashOf(scene) > 0.5 ? 2 : 0
  // Half his block size, so he walks up to the castle's edge rather than
  // stopping where his full-size self would have.
  const lounge = loungeX(columns)
  const build = castleX(columns) - 13
  const toCastle = clamp((scene.x - lounge) / Math.max(1, build - lounge), 0, 1)
  const x = (scene.x + 1 + toCastle * (BODY_WIDTH - (BODY_WIDTH * UNIT) / SCALE)) * SCALE
  disc(fine, x + 6 * UNIT, ground - 2, 7 * UNIT, 0x000000, 0.18, 0.15)
  const top = drawHeroFine(fine, pose, facing, x, ground - 2, lift, UNIT)

  if (scene.act <= 1 || (scene.act >= 4 && scene.x <= loungeX(columns))) {
    const eyes = top + EYE_ROW * UNIT
    const [first, second] = EYE_COLUMNS
    rect(fine, x + (first - 1) * UNIT, eyes, (second - first + 3) * UNIT, UNIT * 1.5, SHADES)
    dot(fine, x + (first - 1) * UNIT + 1, eyes, 0xffffff, 0.8)
    dot(fine, x + (second - 1) * UNIT + 1, eyes, 0xffffff, 0.8)
  }

  drawGull(fine, scene)
  if (scene.gull !== null && scene.gull < columns - 4 && scene.gull > columns * 0.4) {
    overlays.push({ column: Math.round(scene.gull) + 2, row: 0, text: 'Caw!', color: 0xdddddd })
  }

  if (scene.act === 3 && scene.actSeconds > 0.4 && scene.actSeconds < 1.4) {
    overlays.push({ column: castleX(columns) - 2, row: 0, text: 'SPLASH!', color: FOAM })
  }

  return overlays
}

export const beachCells = (scene: Beach, columns: number, rows: number) => {
  const fine = createFine(columns, rows)
  return fineCells(fine, drawBeach(fine, scene, columns))
}

export const beachPicture = (scene: Beach, columns: number, rows: number) => {
  const fine = createFine(columns, rows)
  return finePicture(fine, drawBeach(fine, scene, columns))
}
