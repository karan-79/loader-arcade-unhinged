// chill-drive: a little car out for a drive while the road scrolls past.
// Over the acts: parked with the engine ticking over, pulling away, cruising
// past hills and trees, into a sunset, and on into the night under the stars
// with the headlights on and street lamps going by.

import type { Act } from './acts'
import type { Fine } from './fine'
import { SCALE, createFine, disc, dot, fineCells, finePicture, glow, gradient, line, rect, sprite } from './fine'
import { clamp, mix, noise } from './raster'

const PALETTE: Record<string, number> = {
  r: 0xd97757, // body
  o: 0xd97757, // Clawd, at the wheel
  w: 0x9fd3e0, // glass
  k: 0x3a3a3a, // tyre
  h: 0xfff2a8, // headlight
  t: 0xff4d4d, // tail light
}

// The car in text: facing right, block pixels; the wheels alternate to roll.
const CAR = ['...rrr..', '..rwwor.', 'trrrrrrh']
const WHEELS = ['.kk..kk.', '.k...k..']

const LANE = 0xd8d8d8
const TRUNK = 0x6b4226
const SUN = 0xffe066
const SUN_DUSK = 0xff7a3d
const STAR = 0xc8d0ff
const LAMP = 0xffe7a0

const CRUISE_SPEED = 26 // pixels a second
const PULL_AWAY_SECONDS = 1.4
const DUSK_SECONDS = 6

type Puff = { x: number; y: number; age: number }

export type Cruise = {
  act: Act
  seconds: number
  actSeconds: number
  speed: number
  // How far the road has scrolled, in pixels.
  distance: number
  puffs: Puff[]
}

export const createCruise = (): Cruise => ({ act: 4, seconds: 0, actSeconds: 0, speed: CRUISE_SPEED, distance: 0, puffs: [] })

export const beginCruise = (scene: Cruise) => {
  Object.assign(scene, createCruise(), { act: 0, speed: 0 })
}

const carX = (columns: number) => Math.round(columns * 0.25)
const duskOf = (scene: Cruise) => (scene.act === 3 ? clamp(scene.actSeconds / DUSK_SECONDS, 0, 1) : scene.act >= 4 ? 1 : 0)
const isNight = (scene: Cruise) => scene.act >= 4

export const stepCruise = (scene: Cruise, seconds: number, columns: number, random: () => number = Math.random) => {
  scene.seconds += seconds
  scene.actSeconds += seconds

  // Parked in act 0; pulling away in act 1; cruising after.
  const target = scene.act === 0 ? 0 : scene.act === 1 ? CRUISE_SPEED * clamp(scene.actSeconds / PULL_AWAY_SECONDS, 0, 1) : CRUISE_SPEED
  scene.speed += (target - scene.speed) * Math.min(1, seconds * 4)
  scene.distance += scene.speed * seconds

  // Exhaust: a puff now and then while idling, a stream when pulling away.
  const puffChance = scene.act === 0 ? 0.15 : scene.act === 1 ? 0.6 : 0.08
  if (random() < puffChance) {
    scene.puffs.push({ x: carX(columns) - 1, y: 0, age: 0 })
  }

  for (const puff of scene.puffs) {
    puff.age += seconds
    puff.x -= (4 + scene.speed * 0.6) * seconds
    puff.y -= 2 * seconds
  }
  scene.puffs = scene.puffs.filter(puff => puff.age < 0.8)
}

// Scenery scrolls at `rate` of the road's speed: the spot in the world that
// fine column `x` shows.
const scrolled = (scene: Cruise, x: number, rate: number) => x + scene.distance * SCALE * rate

const SKY = { top: 0x5fa8e8, low: 0xc4e6f7 }
const SKY_DUSK = { top: 0x3b2a6b, low: 0xff9a5a }
const SKY_NIGHT = { top: 0x070b24, low: 0x1e2a55 }
const MOUNTAINS = 0x6f86a8
const SNOW = 0xf2f6ff
const GRASS = 0x4f8a3a
const ASPHALT = 0x34363b

// Fine rows: the road's top edge, and its centre line.
const ROAD_TOP = 24
const LANE_ROW = 28

const skyOf = (scene: Cruise) => {
  if (isNight(scene)) {
    return SKY_NIGHT
  }
  const dusk = duskOf(scene)
  return { top: mix(SKY.top, SKY_DUSK.top, dusk), low: mix(SKY.low, SKY_DUSK.low, dusk) }
}

// Darkens scenery toward the sky's colour as the light goes.
const shaded = (scene: Cruise, color: number) =>
  isNight(scene) ? mix(color, 0x0b1028, 0.75) : mix(color, 0x4a3360, duskOf(scene) * 0.5)

const drawSky = (fine: Fine, scene: Cruise) => {
  const sky = skyOf(scene)
  gradient(fine, 0, ROAD_TOP, sky.top, sky.low)

  if (isNight(scene)) {
    for (let x = 0; x < fine.width; x += 2) {
      const at = Math.floor(scrolled(scene, x, 0.01) / 2)
      if (noise(at, 11) > 0.93) {
        dot(fine, x, 1 + noise(at, 5) * 12, STAR, 0.4 + 0.6 * noise(at, Math.floor(scene.seconds * 3)))
      }
    }
    const moon = fine.width * 0.7
    glow(fine, moon, 6, 12, 0xf2f0e0, 0.25)
    disc(fine, moon, 6, 3.5, 0xf2f0e0)
    disc(fine, moon + 1.8, 5, 3.2, sky.top)
    return
  }

  const dusk = duskOf(scene)
  const sunX = fine.width * 0.75
  const sunY = 6 + dusk * 10
  const sun = mix(SUN, SUN_DUSK, dusk)
  glow(fine, sunX, sunY, 16 + dusk * 10, sun, 0.45 + dusk * 0.2, 0.8)
  disc(fine, sunX, sunY, 4, sun)

  const tint = mix(0xffffff, 0xffb08a, dusk)
  const span = fine.width + 60
  for (let cloud = 0; cloud < 3; cloud++) {
    const x = ((noise(cloud, 41) * span - scrolled(scene, 0, 0.03)) % span + span) % span - 30
    const y = 3 + cloud * 3
    const size = 2.5 + noise(cloud, 13) * 1.5
    for (const [dx, dy, r] of [[0, 1, 1], [size * 1.4, 0, 1.3], [size * 2.8, 1, 1.1], [size * 4, 1.5, 0.8]] as const) {
      disc(fine, x + dx, y + dy, size * r, tint, 0.85, 0.6)
    }
  }
}

// A silhouette scrolling at `rate`: for each column, how many fine rows tall.
const ridge = (fine: Fine, scene: Cruise, rate: number, base: number, height: (at: number) => number, color: (at: number, depth: number, y: number) => number) => {
  for (let x = 0; x < fine.width; x++) {
    const at = scrolled(scene, x, rate)
    const top = base - height(at)
    for (let y = Math.max(0, Math.floor(top)); y < base; y++) {
      dot(fine, x, y, color(at, y - top, y))
    }
  }
}

const drawTree = (fine: Fine, scene: Cruise, x: number, kind: number) => {
  const ground = ROAD_TOP
  const crown = shaded(scene, kind > 0.6 ? 0x2e6b35 : 0x3f8f3a)
  const light = shaded(scene, kind > 0.6 ? 0x3d8a44 : 0x58a84a)
  rect(fine, x - 0.5, ground - 4, 2, 4, shaded(scene, TRUNK))

  if (kind > 0.6) {
    // A pine: three tiers.
    for (let tier = 0; tier < 3; tier++) {
      const top = ground - 13 + tier * 3
      for (let dy = 0; dy < 5; dy++) {
        const half = 1 + dy * (0.8 + tier * 0.1)
        rect(fine, x - half, top + dy, half * 2 + 1, 1, dy < 2 ? light : crown)
      }
    }
  } else {
    disc(fine, x, ground - 9, 5, crown, 1, 0.9)
    disc(fine, x - 1.5, ground - 10.5, 2.5, light, 0.8)
  }
}

const drawLamp = (fine: Fine, x: number) => {
  rect(fine, x, ROAD_TOP - 14, 1, 14, 0x55585e)
  line(fine, x, ROAD_TOP - 14, x + 3, ROAD_TOP - 15, 0x55585e)
  glow(fine, x + 3, ROAD_TOP - 13, 10, LAMP, 0.5)
  glow(fine, x + 4, ROAD_TOP + 3, 12, LAMP, 0.35, 0.3)
  rect(fine, x + 2, ROAD_TOP - 14, 3, 1, LAMP)
}

// The car in text, in block pixels on the cell grid so it stays crisp.
const drawCarBlocks = (fine: Fine, scene: Cruise, columns: number) => {
  const x = carX(columns) * SCALE
  const bob = scene.speed > 1 && Math.floor(scene.seconds * 6) % 3 === 0 ? SCALE : 0
  const wheels = scene.speed > 1 && Math.floor(scene.distance / 2) % 2 === 1 ? WHEELS[1]! : WHEELS[0]!
  sprite(fine, CAR, PALETTE, x, fine.height - 4 * SCALE - bob)
  sprite(fine, [wheels], PALETTE, x, fine.height - SCALE)

  if (isNight(scene)) {
    for (let dx = 1; dx <= 44; dx++) {
      const spread = dx * 0.22
      for (let dy = -spread * 0.4; dy <= spread; dy++) {
        dot(fine, x + 32 + dx, fine.height - 6 - bob + dy, LAMP, 0.35 * (1 - dx / 45))
      }
    }
  }
}

const drawCar = (fine: Fine, scene: Cruise, columns: number) => {
  if (fine.forText) {
    drawCarBlocks(fine, scene, columns)
    return
  }

  const x = carX(columns) * SCALE
  const bob = scene.speed > 1 && Math.floor(scene.seconds * 6) % 3 === 0 ? 1 : 0
  const base = fine.height - 4 - bob
  const body = PALETTE.r!
  const dark = mix(body, 0x000000, 0.3)

  disc(fine, x + 16, fine.height - 2, 17, 0x000000, 0.3, 0.12)

  // Lower body, with a darker sill and a highlight along the top.
  rect(fine, x + 1, base - 7, 30, 6, body)
  rect(fine, x, base - 6, 1, 4, body)
  rect(fine, x + 31, base - 6, 1, 4, body)
  rect(fine, x + 1, base - 2, 30, 1, dark)
  rect(fine, x + 2, base - 7, 28, 1, mix(body, 0xffffff, 0.25))

  // The cabin: a sloped roof, glass, a pillar, and Clawd at the wheel.
  for (let dy = 0; dy < 6; dy++) {
    const left = x + 9 - Math.min(dy, 3)
    const right = x + 21 + Math.min(dy, 4)
    rect(fine, left, base - 13 + dy, right - left, 1, dy === 0 ? body : PALETTE.w!)
  }
  rect(fine, x + 15, base - 12, 1, 5, body)
  rect(fine, x + 18, base - 12, 5, 4, 0xd97757)
  dot(fine, x + 19, base - 11, 0x141414)
  dot(fine, x + 21, base - 11, 0x141414)
  dot(fine, x + 19, base - 10, 0x141414)
  dot(fine, x + 21, base - 10, 0x141414)
  rect(fine, x + 10, base - 12, 4, 1, 0xffffff, 0.35)

  // Lights.
  rect(fine, x + 31, base - 6, 1, 2, PALETTE.h!)
  rect(fine, x, base - 6, 1, 2, PALETTE.t!)
  if (isNight(scene)) {
    glow(fine, x - 1, base - 5, 5, PALETTE.t!, 0.6)
    for (let dx = 1; dx <= 44; dx++) {
      const spread = dx * 0.22
      for (let dy = -spread * 0.4; dy <= spread; dy++) {
        dot(fine, x + 31 + dx, base - 5 + dy, LAMP, 0.35 * (1 - dx / 45))
      }
    }
  } else if (scene.act === 0 && Math.floor(scene.seconds * 4) % 4 === 1) {
    glow(fine, x + 32, base - 5, 4, LAMP, 0.8)
  }

  // Wheels, their hubs turning with the road.
  const turn = (scene.distance * SCALE) / 3.5
  for (const cx of [x + 7, x + 24]) {
    disc(fine, cx, base, 3.6, 0x1e1e1e)
    disc(fine, cx, base, 2, 0xb8bcc4)
    line(fine, cx - Math.cos(turn) * 1.6, base - Math.sin(turn) * 1.6, cx + Math.cos(turn) * 1.6, base + Math.sin(turn) * 1.6, 0x55585e)
  }
}

const drawCruise = (fine: Fine, scene: Cruise, columns: number) => {
  drawSky(fine, scene)

  // Far mountains, snow-capped, hazy with distance; very slow.
  ridge(fine, scene, 0.05, ROAD_TOP - 6, at => 8 + 5 * Math.sin(at * 0.025) + 3 * Math.sin(at * 0.071 + 2) + 2 * Math.abs(Math.sin(at * 0.13)),
    (_, depth, y) => (y < ROAD_TOP - 17 && depth < 3 && !isNight(scene) ? mix(SNOW, skyOf(scene).low, duskOf(scene) * 0.6) : shaded(scene, mix(MOUNTAINS, skyOf(scene).low, 0.35))))

  // Rolling hills, nearer and faster.
  ridge(fine, scene, 0.18, ROAD_TOP - 2, at => 4 + 2.5 * Math.sin(at * 0.04) + 1.5 * Math.sin(at * 0.11 + 1),
    (at, depth) => shaded(scene, depth < 1 ? 0x6fb04f : !fine.forText && noise(Math.floor(at), Math.floor(depth)) > 0.85 ? 0x3f7a30 : GRASS))
  rect(fine, 0, ROAD_TOP - 2, fine.width, 2, shaded(scene, 0x4a7f36))

  // Trees by day, street lamps by night, closer and faster.
  const spacing = 23 * SCALE
  const offset = scrolled(scene, 0, 0.6)
  for (let at = Math.floor(offset / spacing) * spacing; at < offset + fine.width + spacing; at += spacing) {
    const x = at - offset
    const which = noise(Math.floor(at / spacing), 1)
    if (isNight(scene)) {
      drawLamp(fine, x)
    } else if (which > 0.25) {
      drawTree(fine, scene, x, which)
      if (which > 0.75) {
        drawTree(fine, scene, x + 7, noise(Math.floor(at / spacing), 2))
      }
    }
  }

  // The road: a pale edge, speckled asphalt and a dashed centre line.
  for (let x = 0; x < fine.width; x++) {
    const at = Math.floor(scrolled(scene, x, 1))
    dot(fine, x, ROAD_TOP, shaded(scene, 0xb8b8b0))
    for (let y = ROAD_TOP + 1; y < fine.height; y++) {
      dot(fine, x, y, !fine.forText && noise(at, y) > 0.9 ? mix(ASPHALT, 0x6a6a6a, 0.5) : ASPHALT)
    }
    if (Math.floor(at / 6) % 3 === 0) {
      dot(fine, x, LANE_ROW, shaded(scene, LANE))
    }
  }

  for (const puff of scene.puffs) {
    const fade = puff.age / 0.8
    disc(fine, puff.x * SCALE, fine.height - 6 + puff.y * SCALE, 1.5 + fade * 2.5, mix(0xcfcfcf, 0x777777, fade), 0.6 * (1 - fade))
  }

  drawCar(fine, scene, columns)
}

export const cruiseCells = (scene: Cruise, columns: number, rows: number) => {
  const fine = createFine(columns, rows, true)
  drawCruise(fine, scene, columns)
  return fineCells(fine)
}

export const cruisePicture = (scene: Cruise, columns: number, rows: number) => {
  const fine = createFine(columns, rows)
  drawCruise(fine, scene, columns)
  return finePicture(fine)
}
