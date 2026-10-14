// What Pinch's fights share: the arena's size, sparks and pop-up words, waves
// that escalate into boss fights, powerup drops that fly to Pinch, the
// heads-up line, and drawing a rival running, hurt, knocked out or as a boss.

import type { Canvas, Overlay } from './raster'
import { clamp, mix, plot, plotSprite } from './raster'
import { LEG_COLOR, legsOf, rivalAt, scaleSprite } from './rivals'

// 5 cell rows: the heads-up line in the top one, 10 pixel rows in all.
export const ARENA_ROWS = 5
export const GROUND = ARENA_ROWS * 2
export const BOSS_HEIGHT = GROUND

export const between = (random: () => number, low: number, high: number) =>
  low + (high - low) * random()

export const pickFrom = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)] ?? items[0]!

// Sparks: hits, explosions, dust (soft ones draw as shade glyphs).

export type Spark = {
  x: number
  y: number
  vx: number
  vy: number
  age: number
  life: number
  color: number
  isSoft: boolean
}

export const HIT_SPARKS = [0xffffff, 0xffe066, 0xffb347]
export const STEEL_SPARKS = [0xffffff, 0xcfe8ff, 0xffe066]

export const burst = (
  sparks: Spark[],
  x: number,
  y: number,
  count: number,
  colors: readonly number[],
  random: () => number,
  speed = 20,
  isSoft = false,
) => {
  for (let i = 0; i < count; i++) {
    sparks.push({
      x,
      y,
      vx: between(random, -speed, speed),
      vy: between(random, -speed * 0.8, speed * 0.4),
      age: 0,
      life: between(random, 0.2, 0.5),
      color: pickFrom(colors, random),
      isSoft,
    })
  }
}

export const stepSparks = (sparks: Spark[], seconds: number) => {
  for (const spark of sparks) {
    spark.age += seconds
    spark.x += spark.vx * seconds
    spark.y += spark.vy * seconds
    spark.vy += 30 * seconds
  }

  return sparks.filter(spark => spark.age < spark.life)
}

export const drawSparks = (canvas: Canvas, sparks: readonly Spark[]) => {
  for (const spark of sparks) {
    plot(canvas, spark.x, spark.y, mix(spark.color, 0x333333, spark.age / spark.life), spark.isSoft)
  }
}

// Pop-up words (POW!, CLANG!) in the heads-up line, over where they happened.

export type Pop = { text: string; x: number; age: number }

const POP_SECONDS = 0.6
const POP_COLORS = [0xffe066, 0xffffff]

export const popWord = (pops: Pop[], text: string, x: number) => {
  pops.push({ text, x, age: 0 })
}

export const stepPops = (pops: Pop[], seconds: number) => {
  for (const pop of pops) {
    pop.age += seconds
  }

  return pops.filter(pop => pop.age < POP_SECONDS)
}

const popOverlays = (pops: readonly Pop[], columns: number): Overlay[] =>
  pops.map(pop => ({
    column: clamp(Math.round(pop.x - pop.text.length / 2), 0, Math.max(0, columns - pop.text.length)),
    row: 0,
    text: pop.text,
    color: POP_COLORS[Math.floor(pop.age * 12) % POP_COLORS.length] ?? POP_COLORS[0]!,
  }))

// Waves: every WAVE_KOS knockouts the wave goes up, rivals come faster, and
// every third wave is a boss.

export const WAVE_KOS = 6

export type Waves = { wave: number; kos: number; waveKos: number; combo: number; comboSeconds: number }

export const createWaves = (): Waves => ({ wave: 1, kos: 0, waveKos: 0, combo: 0, comboSeconds: 0 })

export const isBossWave = (wave: number) => wave % 3 === 0

export const spawnSeconds = (waves: Waves, random: () => number) =>
  between(random, 0.7, 1.5) * Math.max(0.35, 1 - (waves.wave - 1) * 0.1)

export const foeSpeed = (waves: Waves, random: () => number) => between(random, 10, 18) + waves.wave * 1.5

export const bossHp = (waves: Waves) => 8 + waves.wave * 2

// Counts a knockout; true when it starts a boss wave.
export const countKo = (waves: Waves) => {
  waves.kos += 1
  waves.waveKos += 1
  waves.combo += 1
  waves.comboSeconds = 1.6

  if (waves.waveKos >= WAVE_KOS) {
    waves.wave += 1
    waves.waveKos = 0

    return isBossWave(waves.wave)
  }

  return false
}

export const countBossDown = (waves: Waves) => {
  waves.kos += 1
  waves.wave += 1
  waves.waveKos = 0
}

export const stepWaves = (waves: Waves, seconds: number) => {
  waves.comboSeconds = Math.max(0, waves.comboSeconds - seconds)

  if (waves.comboSeconds === 0) {
    waves.combo = 0
  }
}

// Powerup drops: they pop out of a knocked-out rival, then fly to Pinch.

export type Drop<K extends string> = { kind: K; x: number; y: number; vx: number; vy: number; age: number }

export const dropFrom = <K extends string>(drops: Drop<K>[], kind: K, x: number, y: number, random: () => number) => {
  drops.push({ kind, x, y, vx: between(random, -8, 8), vy: -between(random, 14, 20), age: 0 })
}

// Moves the drops; returns the kinds that reached Pinch.
export const stepDrops = <K extends string>(drops: Drop<K>[], seconds: number, toX: number, toY: number) => {
  const arrived: K[] = []

  for (const drop of drops) {
    drop.age += seconds

    if (drop.age < 0.5) {
      drop.x += drop.vx * seconds
      drop.y = Math.min(GROUND - 2, drop.y + drop.vy * seconds)
      drop.vy += 50 * seconds
    } else {
      const dx = toX - drop.x
      const dy = toY - drop.y
      const distance = Math.hypot(dx, dy)
      const step = Math.min(distance, 45 * seconds)
      drop.x += (dx / (distance || 1)) * step
      drop.y += (dy / (distance || 1)) * step

      if (distance < 1.5) {
        arrived.push(drop.kind)
        drop.age = Infinity
      }
    }
  }

  return { drops: drops.filter(drop => drop.age !== Infinity), arrived }
}

export const drawDrops = <K extends string>(canvas: Canvas, drops: readonly Drop<K>[], colors: Record<K, number>) => {
  for (const drop of drops) {
    const color = colors[drop.kind]
    const blink = Math.floor(drop.age * 10) % 2 === 0

    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        plot(canvas, drop.x + dx, drop.y + dy, dx === 0 && dy === 0 && blink ? 0xffffff : color)
      }
    }
  }
}

// Rivals: running on legs, flashing when hit, knocked out upside down, or a boss.

export type FoeLook = {
  stride?: number
  lift?: number
  isFlipped?: boolean
  fade?: number
  flash?: number
  height?: number
  rows?: readonly string[]
  // Helmets: 1 an army helmet, 2 a steel one.
  helmet?: number
}

const HELMETS: Record<number, { shell: number; shine: number }> = {
  1: { shell: 0x5b6b3a, shine: 0x8fa060 },
  2: { shell: 0x8a9099, shine: 0xd0d6de },
}

export const spriteOf = (rival: number, height?: number) => {
  const sprite = rivalAt(rival).sprite

  return height === undefined ? sprite : scaleSprite(sprite, height)
}

export const drawFoe = (canvas: Canvas, rival: number, x: number, look: FoeLook = {}) => {
  const { palette } = rivalAt(rival)
  let sprite = look.rows ?? spriteOf(rival, look.height)
  const width = sprite[0]?.length ?? 5

  if (look.stride !== undefined && !look.isFlipped) {
    sprite = [...sprite, legsOf(width, look.stride)]
  }

  if (look.isFlipped) {
    sprite = [...sprite].reverse()
  }

  const shaded = Object.fromEntries(
    Object.entries({ ...palette, l: LEG_COLOR }).map(([key, color]) => [
      key,
      (look.flash ?? 0) > 0 ? 0xffffff : mix(color, 0x3a3a3a, look.fade ?? 0),
    ]),
  )
  const top = GROUND - sprite.length - Math.round(look.lift ?? 0)
  plotSprite(canvas, sprite, shaded, Math.round(x), top)

  // A helmet sits on top: a dome a row above, with a brim the logo's width.
  const helmet = HELMETS[look.helmet ?? 0]
  if (helmet !== undefined && !look.isFlipped) {
    const left = Math.round(x)

    for (let dx = 0; dx < width; dx++) {
      plot(canvas, left + dx, top, helmet.shell)
    }

    for (let dx = 1; dx < width - 1; dx++) {
      plot(canvas, left + dx, top - 1, dx === 2 ? helmet.shine : helmet.shell)
    }
  }

  return { width, top }
}

export const drawStars = (canvas: Canvas, x: number, width: number, top: number, seconds: number) => {
  ;[0xffe066, 0xffffff].forEach((color, star) => {
    const angle = seconds * 9 + star * Math.PI
    plot(canvas, x + width / 2 + Math.cos(angle) * (width / 2 + 1), top - 1 + Math.sin(angle) * 0.6, color)
  })
}

// Explosion rings.

export type Ring = { x: number; y: number; age: number }

export const stepRings = (rings: Ring[], seconds: number) => {
  for (const ring of rings) {
    ring.age += seconds
  }

  return rings.filter(ring => ring.age < 0.6)
}

export const drawRings = (canvas: Canvas, rings: readonly Ring[]) => {
  for (const ring of rings) {
    const radius = ring.age * 32
    const color = mix(mix(0xffffff, 0xffe066, ring.age * 2), 0x7a4a00, ring.age / 0.6)

    for (let angle = 0; angle < Math.PI * 2; angle += 0.12) {
      plot(canvas, ring.x + Math.cos(angle) * radius, ring.y + Math.sin(angle) * radius * 0.45, color)
    }
  }
}

// The heads-up line: score on the left, the boss's health on the right, and
// the pop-up words between.

const HUD_COLOR = 0x9a9a9a
const BOSS_COLOR = 0xff7b72

export const hpBar = (hp: number, max: number, width = 8) => {
  const full = clamp(Math.ceil((hp / max) * width), 0, width)

  return '█'.repeat(full) + '░'.repeat(width - full)
}

export type Hud = { left: string; right?: string }

// A line someone says, in quotes over their head, in their voice's colour.
export type Speech = { text: string; x: number; color: number }

export const HERO_VOICE = 0xffa070
export const BOSS_VOICE = 0xff7b72

// A rival speaks in its logo's colour, lifted a little so it reads.
export const rivalVoice = (rival: number) => mix(Object.values(rivalAt(rival).palette)[0] ?? 0xffffff, 0xffffff, 0.25)

// Each line centred over its speaker, then nudged right so no two touch.
const speechOverlays = (speech: readonly Speech[], columns: number): Overlay[] => {
  const placed = speech
    .map(({ text, x, color }) => {
      const quoted = `"${text}"`

      return { column: Math.round(x - quoted.length / 2), row: 0, text: quoted, color }
    })
    .sort((a, b) => a.column - b.column)

  let end = -2
  for (const line of placed) {
    line.column = clamp(Math.max(line.column, end + 2), 0, Math.max(0, columns - line.text.length))
    end = line.column + line.text.length - 1
  }

  return placed
}

const overlaps = (a: Overlay, b: Overlay) =>
  a.row === b.row && a.column < b.column + b.text.length + 1 && b.column < a.column + a.text.length + 1

export const hudOverlays = (hud: Hud, pops: readonly Pop[], columns: number, speech: readonly Speech[] = []): Overlay[] => {
  const said = speechOverlays(speech, columns)
  const rest = [
    { column: 1, row: 0, text: hud.left, color: HUD_COLOR },
    ...(hud.right === undefined
      ? []
      : [{ column: Math.max(0, columns - hud.right.length - 1), row: 0, text: hud.right, color: BOSS_COLOR }]),
    ...popOverlays(pops, columns),
  ]

  // What is said wins the line; the score and pop-ups it would cover step aside.
  return [...rest.filter(overlay => !said.some(line => overlaps(line, overlay))), ...said]
}

export const scoreLine = (waves: Waves, power?: { name: string; seconds: number } | null) =>
  [
    `W${waves.wave} KO ${waves.kos}`,
    waves.combo >= 3 ? `x${waves.combo}` : '',
    power ? `${power.name} ${Math.ceil(power.seconds)}s` : '',
  ]
    .filter(part => part !== '')
    .join('  ')
