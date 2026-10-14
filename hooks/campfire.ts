// chill-campfire: a night in the mountains. Clawd sits on a log by a fire,
// his knight's gear (helmet, shield, sword) set down by a big pine. Over the
// acts: the fire smoulders at dusk, catches with a crackle, Clawd roasts a
// marshmallow (not always well), night falls with stars, a rising moon,
// fireflies and an owl, and at last he dozes off as shooting stars go over.
//
// The people and things are block sprites on the cell grid, so they stay
// crisp in plain terminals; the sky, mountains, glow and flames are fine.

import type { Act } from './acts'
import type { Fine } from './fine'
import { SCALE, createFine, disc, dot, fineCells, finePicture, glow, gradient, line, rect, sprite } from './fine'
import { HERO_PALETTE } from './hero'
import type { Overlay } from './raster'
import { clamp, mix, noise } from './raster'

// Clawd sitting, looking right at the fire; dozing, his eyes shut.
const SITTING = ['.oooooooooo.', '.oooKooooKo.', '.oooKooooKo.', 'oooooooooooo', '.oooooooooo.', 'oo.o....o.oo']
const DOZING = ['.oooooooooo.', '.oooooooooo.', '.oooKooooKo.', 'oooooooooooo', '.oooooooooo.', 'oo.o....o.oo']
// Roasting: an arm out toward the fire.
const ROASTING = ['.oooooooooo.', '.oooKooooKo.', '.oooKooooKo.', 'oooooooooooooo', '.oooooooooo.', 'oo.o....o.oo']
const SIT_WIDTH = 12

// The knight's gear: a plumed helmet, a shield, a sword planted point down.
const HELMET = ['..r..', '.rss.', 'ssSss', 'skkks', 'sssss']
const SHIELD = ['bbbbb', 'bbybb', 'byyyb', 'bbybb', '.bbb.', '..b..']
const SWORD = ['.y.', '.h.', 'yyy', '.s.', '.s.', '.s.', '.s.']
const GEAR = { r: 0xd23c3c, s: 0xb8c0cc, S: 0xe8eef6, k: 0x2a2e36, b: 0x2f5aa8, y: 0xe8c547, h: 0x6b4226 }

// The big pine the gear rests against: tiers, widest at the bottom.
const PINE = [
  '....gg....',
  '...gGgg...',
  '..gGgggg..',
  '...gGgg...',
  '..gGggggg.',
  '.gGgggggg.',
  '..gGgggg..',
  '.gGggggggg',
  '....tt....',
  '....tt....',
]
const PINE_PALETTE = { g: 0x1f4d2e, G: 0x2e6b3d, t: 0x5a3a22 }

const LOG = 0x6b4226
const LOG_END = 0xc8a070
const FLAME = [0xfff2b0, 0xffc23a, 0xff7a1a, 0xd8401a]
const STAR = 0xd8dcff
const MOON = 0xf2f0e0
const FIREFLY = 0xd8f27a

const SKY_DUSK = { top: 0x2b2550, low: 0xe8885a }
const SKY_NIGHT = { top: 0x050818, low: 0x16204a }
const NIGHT_SECONDS = 6
const TOAST_SECONDS = 5

type Spark = { x: number; y: number; vx: number; age: number }
type Mote = { x: number; y: number; phase: number; speed: number }

export type Campfire = {
  act: Act
  seconds: number
  actSeconds: number
  // How big the fire is, 0 (embers) to 1 (roaring).
  fire: number
  // How done the marshmallow is: 0 white, 1 golden, past 1.3 alight.
  toast: number
  sparks: Spark[]
  fireflies: Mote[]
  meteor: { x: number; y: number; age: number } | null
  untilMeteor: number
}

export const createCampfire = (): Campfire => ({
  act: 4,
  seconds: 0,
  actSeconds: 0,
  fire: 0.6,
  toast: 0,
  sparks: [],
  fireflies: [],
  meteor: null,
  untilMeteor: 2,
})

export const beginCampfire = (scene: Campfire) => {
  Object.assign(scene, createCampfire(), { act: 0, fire: 0.2 })
}

// Where everything stands, in block pixels.
const treeX = (columns: number) => Math.round(columns * 0.14)
const gearX = (columns: number) => treeX(columns) + 9
const clawdX = (columns: number) => Math.round(columns * 0.38)
const fireX = (columns: number) => clawdX(columns) + SIT_WIDTH + 7

// 0 at dusk, 1 once night has fallen (over act 3).
const nightOf = (scene: Campfire) => (scene.act < 3 ? 0 : scene.act === 3 ? clamp(scene.actSeconds / NIGHT_SECONDS, 0, 1) : 1)

export const stepCampfire = (scene: Campfire, seconds: number, columns: number, random: () => number = Math.random) => {
  scene.seconds += seconds
  scene.actSeconds += seconds

  // Smouldering, catching, roaring, and low again as Clawd dozes.
  const target = scene.act === 0 ? 0.2 : scene.act === 1 ? 0.2 + 0.8 * clamp(scene.actSeconds / 2, 0, 1) : scene.act === 4 ? 0.55 : 1
  scene.fire += (target - scene.fire) * Math.min(1, seconds * 3)

  if (scene.act === 2) {
    scene.toast += seconds / TOAST_SECONDS
  }

  const x = fireX(columns) + 3
  if (random() < scene.fire * 0.6) {
    scene.sparks.push({ x: x + (random() - 0.5) * 3, y: 0, vx: (random() - 0.5) * 2, age: 0 })
  }
  for (const spark of scene.sparks) {
    spark.age += seconds
    spark.y += seconds * (3 + scene.fire * 3)
    spark.x += spark.vx * seconds
  }
  scene.sparks = scene.sparks.filter(spark => spark.age < 1.4)

  const fireflies = scene.act >= 3 ? Math.min(6, 1 + Math.floor(scene.actSeconds)) : 0
  while (scene.fireflies.length < fireflies) {
    scene.fireflies.push({ x: random() * columns, y: 4 + random() * 4, phase: random() * 6, speed: 0.4 + random() * 0.8 })
  }

  scene.untilMeteor -= seconds
  if (scene.act >= 4 && scene.meteor === null && scene.untilMeteor <= 0) {
    scene.meteor = { x: columns * (0.45 + random() * 0.45), y: 0.5 + random(), age: 0 }
    scene.untilMeteor = 4 + random() * 4
  }
  if (scene.meteor !== null) {
    scene.meteor.age += seconds
    scene.meteor = scene.meteor.age > 0.9 ? null : scene.meteor
  }
}

const skyOf = (scene: Campfire) => {
  const night = nightOf(scene)
  return { top: mix(SKY_DUSK.top, SKY_NIGHT.top, night), low: mix(SKY_DUSK.low, SKY_NIGHT.low, night), night }
}

// A star: a dot in a picture, a whole quarter cell in text so it shows.
const star = (fine: Fine, x: number, y: number, amount: number) => {
  if (fine.forText) {
    rect(fine, Math.floor(x / 2) * 2, Math.floor(y / SCALE) * SCALE, 2, SCALE, STAR, amount)
  } else {
    dot(fine, x, y, STAR, amount)
  }
}

const drawSky = (fine: Fine, scene: Campfire, ground: number) => {
  const sky = skyOf(scene)
  gradient(fine, 0, ground, sky.top, sky.low)

  // Stars come out as night falls; text gets fewer, bigger ones.
  const step = fine.forText ? 9 : 3
  for (let x = 0; x < fine.width; x += step) {
    if (noise(x, 21) > 0.82 && noise(x, 22) < sky.night) {
      star(fine, x, 1 + noise(x, 23) * 18, 0.35 + 0.6 * noise(x, Math.floor(scene.seconds * 2)))
    }
  }

  // The moon rises over the peaks.
  if (sky.night > 0) {
    const x = fine.width * 0.78
    const y = 22 - sky.night * 14
    glow(fine, x, y, 22, MOON, 0.25 * sky.night)
    disc(fine, x, y, 5, MOON, sky.night)
    disc(fine, x + 1.5, y - 1.5, 1.2, mix(MOON, 0xb8b0a0, 0.5), 0.6 * sky.night)
  }

  // A shooting star.
  if (scene.meteor !== null) {
    const { x, y, age } = scene.meteor
    const head = { x: x * SCALE - age * 70, y: y * SCALE + age * 18 }
    for (let t = 0; t < 1; t += 0.04) {
      dot(fine, head.x + t * 18, head.y - t * 4.6, STAR, (1 - t) * (1 - age / 0.9))
    }
  }
}

const drawMountains = (fine: Fine, scene: Campfire, ground: number) => {
  const sky = skyOf(scene)
  const far = mix(mix(0x7a6a9a, 0x2a3050, sky.night), sky.low, 0.25)
  const snow = mix(0xf2e0e8, 0x9aa4c8, sky.night)

  // Far peaks, each its own height, snow on the tall ones.
  const PEAK = 44
  for (let x = 0; x < fine.width; x++) {
    const which = Math.floor(x / PEAK)
    const across = (x % PEAK) / PEAK
    const tall = 8 + noise(which, 61) * 16
    const height = tall * (1 - Math.abs(across * 2 - 1)) + 4 + 2 * Math.sin(x * 0.2)
    const top = ground - 6 - height
    for (let y = Math.max(0, Math.floor(top)); y < ground; y++) {
      dot(fine, x, y, tall > 15 && height > tall - 2 && y < top + 2 + (height - tall + 2) ? snow : far)
    }
  }

  // A nearer ridge, dark with pines along it.
  const ridge = mix(0x2a3a3a, 0x0e1622, sky.night)
  for (let x = 0; x < fine.width; x++) {
    const top = ground - 9 - 3 * Math.sin(x * 0.043 + 2) - 2 * Math.sin(x * 0.11)
    for (let y = Math.floor(top); y < ground; y++) {
      dot(fine, x, y, ridge)
    }
    if (noise(Math.floor(x / 5), 31) > 0.45 && x % 5 === 2) {
      const height = 5 + noise(Math.floor(x / 5), 32) * 5
      for (let dy = 0; dy < height; dy++) {
        const half = (dy / height) * 2.5
        rect(fine, x - half, top - height + dy, half * 2 + 1, 1, ridge)
      }
    }
  }
}

const drawGround = (fine: Fine, scene: Campfire, ground: number, columns: number) => {
  const night = nightOf(scene)
  const earth = mix(0x3a4a2a, 0x141c18, night)
  rect(fine, 0, ground, fine.width, fine.height - ground, earth)

  // Firelight pooling on the ground and up the scene.
  const x = (fireX(columns) + 3) * SCALE
  glow(fine, x, fine.height - 4, 70, 0xff8a3d, (0.25 + 0.35 * night) * scene.fire, 0.35)
  glow(fine, x, fine.height - 10, 26, 0xffb347, 0.3 * scene.fire)
}

// Lit by the fire: a colour warmed by how close and how big the fire is.
const firelit = (color: number, scene: Campfire, amount: number) => mix(color, 0xffa050, clamp(amount * scene.fire * (0.15 + 0.2 * nightOf(scene)), 0, 0.35))

// A sprite's palette, firelit; eyes and slits (`K`, `k`) stay dark.
const lit = (palette: Readonly<Record<string, number>>, scene: Campfire, amount: number) =>
  Object.fromEntries(Object.entries(palette).map(([key, color]) => [key, key === 'K' || key === 'k' ? color : firelit(color, scene, amount)]))

const drawCamp = (fine: Fine, scene: Campfire, columns: number) => {
  const bottom = fine.height / SCALE

  // The pine, the gear against it, and an owl in it at night.
  const tree = treeX(columns)
  sprite(fine, PINE, lit(PINE_PALETTE, scene, 0.2), tree * SCALE, (bottom - PINE.length) * SCALE)
  if (nightOf(scene) > 0.5) {
    const blink = Math.floor(scene.seconds * 1.3) % 5 === 0
    const owl = { x: (tree + 5) * SCALE, y: 3 * SCALE }
    rect(fine, owl.x, owl.y, SCALE * 2, SCALE * 2, 0x6b5a48)
    if (!blink) {
      rect(fine, owl.x, owl.y, SCALE / 2 + 1, SCALE / 2 + 1, 0xffd21e)
      rect(fine, owl.x + SCALE + 1, owl.y, SCALE / 2 + 1, SCALE / 2 + 1, 0xffd21e)
    }
  }

  const gear = gearX(columns)
  sprite(fine, SHIELD, lit(GEAR, scene, 0.5), (gear - 2) * SCALE, (bottom - SHIELD.length) * SCALE)
  sprite(fine, HELMET, lit(GEAR, scene, 0.6), (gear + 3) * SCALE, (bottom - HELMET.length) * SCALE)
  sprite(fine, SWORD, lit(GEAR, scene, 0.7), (gear + 8) * SCALE, (bottom - SWORD.length + 1) * SCALE)

  // A glint off the steel now and then.
  if (scene.fire > 0.5 && Math.floor(scene.seconds * 2) % 7 === 0) {
    rect(fine, (gear + 9) * SCALE, (bottom - 4) * SCALE, SCALE, SCALE, 0xffffff, 0.8)
  }

  // Clawd on his log.
  const x = clawdX(columns)
  rect(fine, (x - 1) * SCALE, (bottom - 1) * SCALE, (SIT_WIDTH + 2) * SCALE, SCALE, firelit(LOG, scene, 0.6))
  rect(fine, (x + SIT_WIDTH) * SCALE, (bottom - 1) * SCALE, SCALE, SCALE, firelit(LOG_END, scene, 0.6))

  const pose = scene.act === 4 ? DOZING : scene.act === 2 ? ROASTING : SITTING
  sprite(fine, pose, lit(HERO_PALETTE, scene, 0.8), x * SCALE, (bottom - 1 - pose.length) * SCALE)

  // The marshmallow on a stick, over the flames.
  if (scene.act === 2) {
    const handX = (x + 14) * SCALE
    const handY = (bottom - 4) * SCALE + SCALE / 2
    const tip = { x: (fireX(columns) + 2) * SCALE, y: (bottom - 6) * SCALE }
    line(fine, handX, handY, tip.x, tip.y, 0x8a6a42)
    line(fine, handX, handY + 1, tip.x, tip.y + 1, 0x6b4f30)
    if (fine.forText) {
      line(fine, handX, handY + 2, tip.x, tip.y + 2, 0x6b4f30)
    }
    const color = scene.toast < 1 ? mix(0xfafafa, 0xd8a050, scene.toast) : mix(0xd8a050, 0x2a1a10, clamp((scene.toast - 1) / 0.3, 0, 1))
    rect(fine, tip.x - SCALE / 2, tip.y - SCALE / 2, SCALE, SCALE, color)
    if (scene.toast > 1.3) {
      glow(fine, tip.x, tip.y - 2, 5, FLAME[1]!, 0.8)
    }
  }
}

const drawFire = (fine: Fine, scene: Campfire, columns: number) => {
  const x = (fireX(columns) + 3) * SCALE
  const base = fine.height - 1
  const flicker = scene.seconds * 9

  // Stones ringing it, logs crossed.
  for (const dx of [-10, -6, 6, 10]) {
    disc(fine, x + dx, base - 1, 2, firelit(0x6a6a72, scene, 0.8), 1, 0.8)
  }
  for (const dy of [0, 1]) {
    line(fine, x - 8, base - 1 - dy, x + 8, base - 5 - dy, firelit(LOG, scene, 1))
    line(fine, x - 8, base - 5 - dy, x + 8, base - 1 - dy, firelit(LOG, scene, 1))
  }

  // Tongues of flame, taller as it roars.
  for (let dx = -8; dx <= 8; dx++) {
    const reach = (1 - Math.abs(dx) / 9) * (5 + 19 * scene.fire) * (0.7 + 0.5 * noise(Math.round(x) + dx, Math.floor(flicker)))
    for (let dy = 0; dy < reach; dy++) {
      const heat = dy / reach
      const color = FLAME[Math.min(3, Math.floor(heat * 4))]!
      dot(fine, x + dx + Math.sin(flicker + dy * 0.6) * heat * 2, base - 3 - dy, color, 1 - heat * 0.4)
    }
  }

  // Smoke while it smoulders.
  if (scene.fire < 0.5) {
    for (let puff = 0; puff < 4; puff++) {
      const rise = (scene.seconds * 4 + puff * 6) % 24
      disc(fine, x + Math.sin(rise * 0.3 + puff) * 3, base - 6 - rise, 2 + rise * 0.12, 0x9a9aa4, 0.35 * (1 - rise / 24))
    }
  }

  for (const spark of scene.sparks) {
    const fade = 1 - spark.age / 1.4
    dot(fine, spark.x * SCALE, base - 8 - spark.y * SCALE, mix(FLAME[0]!, FLAME[3]!, spark.age / 1.4), fade)
  }
}

const drawCampfire = (fine: Fine, scene: Campfire, columns: number) => {
  const overlays: Overlay[] = []
  const ground = fine.height - 2 * SCALE

  drawSky(fine, scene, ground)
  drawMountains(fine, scene, ground)
  drawGround(fine, scene, ground, columns)
  drawCamp(fine, scene, columns)
  drawFire(fine, scene, columns)

  for (const fly of scene.fireflies) {
    const shine = 0.5 + 0.5 * Math.sin(scene.seconds * 3 * fly.speed + fly.phase)
    const x = (fly.x + 2 * Math.sin(scene.seconds * fly.speed + fly.phase)) * SCALE
    const y = (fly.y + Math.cos(scene.seconds * fly.speed)) * SCALE
    glow(fine, x, y, 5, FIREFLY, 0.5 * shine)
    if (fine.forText) {
      rect(fine, Math.floor(x / 2) * 2, Math.floor(y / SCALE) * SCALE, 2, SCALE, FIREFLY, shine)
    } else {
      dot(fine, x, y, FIREFLY, shine)
    }
  }

  // Words: a crackle as it catches, the marshmallow's fate, the owl, and z's.
  if (scene.act === 1 && scene.actSeconds > 0.3 && scene.actSeconds < 1.6) {
    overlays.push({ column: fireX(columns) - 1, row: 0, text: 'crackle', color: 0xffc23a })
  }
  if (scene.act === 2 && scene.toast > 0.9 && scene.toast < 1.25) {
    overlays.push({ column: clawdX(columns) + 2, row: 0, text: 'Perfect.', color: 0xf2e0c0 })
  }
  if (scene.act === 2 && scene.toast > 1.35) {
    overlays.push({ column: clawdX(columns) + 2, row: 0, text: 'Oops.', color: 0xffc23a })
  }
  if (scene.act >= 3 && nightOf(scene) > 0.5 && Math.floor(scene.seconds / 3) % 4 === 1) {
    overlays.push({ column: treeX(columns) + 8, row: 0, text: 'Hoo.', color: 0xc8b8a0 })
  }
  if (scene.act === 4) {
    const z = Math.floor(scene.seconds * 1.5) % 3
    overlays.push({ column: clawdX(columns) + SIT_WIDTH - 2 + z, row: Math.max(0, 1 - z), text: 'z', color: 0xc8d0ff })
  }

  return overlays
}

export const campfireCells = (scene: Campfire, columns: number, rows: number) => {
  const fine = createFine(columns, rows, true)
  return fineCells(fine, drawCampfire(fine, scene, columns))
}

export const campfirePicture = (scene: Campfire, columns: number, rows: number) => {
  const fine = createFine(columns, rows)
  return finePicture(fine, drawCampfire(fine, scene, columns))
}
