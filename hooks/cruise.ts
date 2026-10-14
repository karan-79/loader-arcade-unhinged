// chill-drive: a little car out for a drive while the road scrolls past.
// Over the acts: parked with the engine ticking over, pulling away, cruising
// past hills and trees, into a sunset, and on into the night under the stars
// with the headlights on and street lamps going by.

import type { Act } from './acts'
import type { Canvas } from './raster'
import { clamp, createCanvas, mix, noise, packCanvas, plot, plotSprite } from './raster'

const PALETTE: Record<string, number> = {
  r: 0xd97757, // body
  w: 0x9fd3e0, // glass
  k: 0x3a3a3a, // tyre
  h: 0xfff2a8, // headlight
  t: 0xff4d4d, // tail light
}

// Facing right, 4 pixel rows; the wheels alternate to roll.
const CAR = ['...rrr..', '..rwwwr.', 'trrrrrrh']
const WHEELS = ['.kk..kk.', '.k...k..']
const CAR_WIDTH = 8

const ROAD = 0x3a3a3a
const LANE = 0xd8d8d8
const HILLS = 0x2f5d3a
const HILLS_DUSK = 0x4a3360
const HILLS_NIGHT = 0x1c2433
const TREE = 0x2e7d32
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
// column `x` shows.
const scrolled = (scene: Cruise, x: number, rate: number) => x + scene.distance * rate

const drawSky = (canvas: Canvas, scene: Cruise, columns: number) => {
  const dusk = duskOf(scene)

  if (isNight(scene)) {
    for (let x = 0; x < columns; x++) {
      const at = Math.floor(scrolled(scene, x, 0.02))
      if (noise(at, 11) > 0.92 && noise(at, Math.floor(scene.seconds * 2)) > 0.2) {
        plot(canvas, x, Math.floor(noise(at, 5) * 3), STAR, true)
      }
    }
    return
  }

  const sunX = Math.round(columns * 0.75)
  const sunY = dusk * 3
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]] as const) {
    plot(canvas, sunX + dx, sunY + dy, mix(SUN, SUN_DUSK, dusk))
  }
}

export const cruiseCells = (scene: Cruise, columns: number, rows: number) => {
  const canvas = createCanvas(columns, rows)
  const road = canvas.pixelRows - 1
  const dusk = duskOf(scene)
  const hills = isNight(scene) ? HILLS_NIGHT : mix(HILLS, HILLS_DUSK, dusk)

  drawSky(canvas, scene, columns)

  // Far hills: a rolling silhouette, slow.
  for (let x = 0; x < columns; x++) {
    const at = scrolled(scene, x, 0.15)
    const height = 1.5 + 1.2 * Math.sin(at * 0.09) + 0.8 * Math.sin(at * 0.23 + 1)
    for (let y = road - 1; y > road - 1 - height; y--) {
      plot(canvas, x, y, hills)
    }
  }

  // Trees by day, street lamps by night, closer and faster.
  for (let x = 0; x < columns; x++) {
    const at = Math.floor(scrolled(scene, x, 0.6))
    if (at % 23 !== 0) {
      continue
    }

    if (isNight(scene)) {
      for (let y = road - 4; y < road; y++) {
        plot(canvas, x, y, 0x55585e)
      }
      plot(canvas, x + 1, road - 4, LAMP)
      plot(canvas, x + 1, road - 3, mix(LAMP, 0x000000, 0.6), true)
    } else if (noise(Math.floor(at / 23), 1) > 0.3) {
      const crown = mix(TREE, HILLS_DUSK, dusk * 0.6)
      plot(canvas, x, road - 1, TRUNK)
      for (const [dx, dy] of [[-1, 2], [0, 2], [1, 2], [0, 3], [-1, 3], [1, 3], [0, 4]] as const) {
        plot(canvas, x + dx, road - dy, crown)
      }
    }
  }

  // The road, its lane dashes scrolling at full speed.
  for (let x = 0; x < columns; x++) {
    const at = Math.floor(scrolled(scene, x, 1))
    plot(canvas, x, road, at % 8 < 4 ? LANE : ROAD)
  }

  for (const puff of scene.puffs) {
    plot(canvas, puff.x, road - 1 + puff.y, mix(0xcfcfcf, 0x444444, puff.age / 0.8), true)
  }

  const x = carX(columns)
  const bob = scene.speed > 1 && Math.floor(scene.seconds * 6) % 3 === 0 ? 1 : 0
  const wheels = scene.speed > 1 && Math.floor(scene.distance / 2) % 2 === 1 ? WHEELS[1]! : WHEELS[0]!
  plotSprite(canvas, CAR, PALETTE, x, road - 4 - bob)
  plotSprite(canvas, [wheels], PALETTE, x, road - 1)

  // Headlights: a soft beam ahead at night, a blink when starting up.
  if (isNight(scene)) {
    for (let dx = 1; dx <= 10; dx++) {
      plot(canvas, x + CAR_WIDTH + dx, road - 2 - bob + (dx > 5 ? 1 : 0), mix(LAMP, 0x222222, dx / 11), true)
    }
  } else if (scene.act === 0 && Math.floor(scene.seconds * 4) % 4 === 1) {
    plot(canvas, x + CAR_WIDTH, road - 2, LAMP)
  }

  return packCanvas(canvas)
}
