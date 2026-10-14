// chill-beach: Pinch's day at the beach. Over the acts: lounging under an
// umbrella in sunglasses, a gull flies over, Pinch builds a sandcastle, a big
// wave takes it as the sun sets, then night falls by a bonfire.

import type { Act } from './acts'
import { drawHero } from './hero'
import type { Canvas, Overlay } from './raster'
import { clamp, createCanvas, mix, noise, packCanvas, plot, plotSprite } from './raster'

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

const UMBRELLA = ['.rwrwrwrwr.', 'rwrwrwrwrwr', ...Array.from({ length: 8 }, () => '.....p.....')]
const UMBRELLA_PALETTE = { r: 0xe0453a, w: 0xf6f0e6, p: 0xb0a090 }

// The sandcastle, drawn up to as many pixels as Pinch has built.
const CASTLE = ['c.c.c', 'ccccc', 'cc.cc', 'ccccc']
const CASTLE_PIXELS = CASTLE.join('').split('').filter(pixel => pixel === 'c').length
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
    // The wave washes the castle away; Pinch scurries back to the umbrella.
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

const drawSky = (canvas: Canvas, scene: Beach, columns: number) => {
  const dusk = duskOf(scene)

  if (isNight(scene)) {
    for (let x = 0; x < columns; x++) {
      if (noise(x, 7) > 0.93 && noise(x, Math.floor(scene.seconds * 2)) > 0.15) {
        plot(canvas, x, Math.floor(noise(x, 3) * 4), STAR, true)
      }
    }

    const moon = Math.round(columns * 0.8)
    plot(canvas, moon, 1, MOON)
    plot(canvas, moon + 1, 1, MOON)
    plot(canvas, moon, 2, MOON)
    return
  }

  // The sun sinks toward the sea as dusk comes on.
  const sunX = Math.round(columns * 0.8)
  const sunY = 1 + dusk * 4
  const sun = mix(SUN, SUN_DUSK, dusk)
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0.5], [2, 0.5]] as const) {
    if (sunY + dy < SEA_TOP) {
      plot(canvas, sunX + dx, sunY + dy, sun)
    }
  }
}

const drawSea = (canvas: Canvas, scene: Beach, columns: number) => {
  const dusk = duskOf(scene)
  const water = isNight(scene) ? SEA_NIGHT : mix(SEA, SEA_DUSK, dusk)
  const swash = swashOf(scene)
  const bottom = SAND_TOP - 1 + Math.round(swash * 2)
  const top = SEA_TOP - Math.round(swash * 2)

  for (let x = 0; x < columns; x++) {
    for (let y = top; y <= bottom; y++) {
      const crest = y === top && Math.sin(x * 0.35 - scene.seconds * 2.5) > 0.6
      plot(canvas, x, y, crest || (swash > 0.3 && y === bottom) ? FOAM : water)
    }
  }

  // The sun's (or moon's) glint on the water.
  const glintX = Math.round(columns * 0.8)
  for (let y = SEA_TOP; y < SAND_TOP; y++) {
    if (noise(y, Math.floor(scene.seconds * 6)) > 0.4) {
      plot(canvas, glintX + Math.round((noise(y + 9, Math.floor(scene.seconds * 6)) - 0.5) * 3), y, isNight(scene) ? MOON : mix(SUN, SUN_DUSK, dusk))
    }
  }
}

export const beachCells = (scene: Beach, columns: number, rows: number) => {
  const canvas = createCanvas(columns, rows)
  const ground = canvas.pixelRows
  const overlays: Overlay[] = []

  drawSky(canvas, scene, columns)
  drawSea(canvas, scene, columns)

  const sand = isNight(scene) ? SAND_NIGHT : SAND
  for (let x = 0; x < columns; x++) {
    for (let y = SAND_TOP + Math.round(swashOf(scene) * 2); y < ground; y++) {
      plot(canvas, x, y, noise(x, y) > 0.85 ? mix(sand, 0xffffff, 0.15) : sand)
    }
  }

  plotSprite(canvas, UMBRELLA, UMBRELLA_PALETTE, umbrellaX(columns) - 2, ground - UMBRELLA.length)

  if (scene.isCastleStanding) {
    let left = Math.round(scene.castle)
    CASTLE.slice()
      .reverse()
      .forEach((line, row) => {
        ;[...line].forEach((pixel, dx) => {
          if (pixel === 'c' && left-- > 0) {
            plot(canvas, castleX(columns) + dx, ground - 2 - row, CASTLE_COLOR)
          }
        })
      })
  }

  if (scene.act >= 4) {
    const x = fireX(columns)
    const flicker = Math.floor(scene.seconds * 10)
    plot(canvas, x, ground - 2, 0x6b4226)
    plot(canvas, x + 2, ground - 2, 0x6b4226)
    for (let dx = 0; dx < 3; dx++) {
      const height = 1 + Math.round(noise(x + dx, flicker) * 2)
      for (let dy = 0; dy < height; dy++) {
        plot(canvas, x + dx, ground - 3 - dy, dy === 0 ? 0xffb347 : 0xff6a2e)
      }
    }
    for (const spark of scene.sparks) {
      plot(canvas, spark.x, spark.y, mix(0xffe066, 0x553311, spark.age / 0.8), true)
    }
  }

  // Pinch: lounging in shades, walking out, patting the castle, or fleeing the wave.
  const isBuilding = scene.act === 2 && scene.x >= castleX(columns) - 13
  const isWalking = (scene.act === 2 && !isBuilding) || (scene.act >= 3 && scene.x > loungeX(columns))
  const pose = isBuilding ? (Math.floor(scene.seconds * 4) % 2 === 0 ? 'punch' : 'idle') : isWalking && Math.floor(scene.seconds * 8) % 2 === 0 ? 'stride' : 'idle'
  const facing = scene.act >= 3 && scene.x > loungeX(columns) ? -1 : 1
  const lift = scene.act === 3 && swashOf(scene) > 0.5 ? 1 : 0
  const { top } = drawHero(canvas, pose, facing, scene.x, ground, { lift })

  if (scene.act <= 1 || (scene.act >= 4 && scene.x <= loungeX(columns))) {
    for (const dx of [2, 3, 8, 9]) {
      plot(canvas, scene.x + dx, top, SHADES)
    }
  }

  if (scene.gull !== null) {
    const flap = Math.floor(scene.seconds * 6) % 2 === 0
    plot(canvas, scene.gull, 2, GULL)
    plot(canvas, scene.gull - 1, flap ? 1 : 2, GULL)
    plot(canvas, scene.gull + 1, flap ? 1 : 2, GULL)

    if (scene.gull < columns - 4 && scene.gull > columns * 0.4) {
      overlays.push({ column: Math.round(scene.gull) + 2, row: 0, text: 'Caw!', color: 0xdddddd })
    }
  }

  if (scene.act === 3 && scene.actSeconds > 0.4 && scene.actSeconds < 1.4) {
    overlays.push({ column: castleX(columns) - 2, row: 0, text: 'SPLASH!', color: FOAM })
  }

  return packCanvas(canvas, overlays)
}
