// Clawd, the hero: the Claude Code mascot, in 8 pixel rows (4 cell rows),
// facing right.
// Every pose is POSE_WIDTH wide with the body in its first BODY_WIDTH columns,
// so arms and legs can reach past it; `poseFacing` mirrors one to face left.

import type { Canvas } from './raster'
import { mirror, plotSprite } from './raster'
import { scaleSprite } from './rivals'

export const HERO_PALETTE: Readonly<Record<string, number>> = {
  o: 0xd97757, // Clawd
  K: 0x141414, // eyes
  g: 0x9aa0a8, // barrel
  G: 0x5c6068, // grip
}

export const POSE_WIDTH = 16
export const BODY_WIDTH = 12
export const POSE_ROWS = 8
// The pixel row the arms stick out at.
export const ARM_ROW = 4

const pad = (rows: readonly string[]) => rows.map(row => row.padEnd(POSE_WIDTH, '.'))

// The eyes: two pixels tall, in these columns from this pixel row down.
export const EYE_ROW = 2
export const EYE_COLUMNS = [3, 8] as const

const HEAD = ['.oooooooooo.', '.oooooooooo.', '.ooKooooKoo.', '.ooKooooKoo.']
const LEGS = ['.o.o....o.o.', '.o.o....o.o.']

export const POSES = {
  idle: pad([...HEAD, 'oooooooooooo', '.oooooooooo.', ...LEGS]),
  stride: pad([...HEAD, 'oooooooooooo', '.oooooooooo.', '..o.o..o.o..', '.o...o....o.']),
  gun: pad([...HEAD, 'oooooooooooooggg', '.oooooooooo..G..', ...LEGS]),
  punch: pad([...HEAD, 'oooooooooooooooo', '.oooooooooo.', ...LEGS]),
  kick: pad([...HEAD, 'ooooooooooo.', '.oooooooooo.', '.o.o....oooooooo', '.o.o']),
  lift: pad(['oooooooooooo', 'o.oooooooo.o', '.ooKooooKoo.', '.ooKooooKoo.', '.oooooooooo.', '.oooooooooo.', ...LEGS]),
} as const

export type Pose = keyof typeof POSES

const MIRRORED: Record<Pose, readonly string[]> = {
  idle: mirror(POSES.idle),
  stride: mirror(POSES.stride),
  gun: mirror(POSES.gun),
  punch: mirror(POSES.punch),
  kick: mirror(POSES.kick),
  lift: mirror(POSES.lift),
}

// The pose's rows and the column to draw them from, for Clawd's body at `x`.
export const poseFacing = (pose: Pose, facing: 1 | -1, x: number) =>
  facing > 0
    ? { rows: POSES[pose], left: x }
    : { rows: MIRRORED[pose], left: x - (POSE_WIDTH - BODY_WIDTH) }

export type HeroLook = {
  // Pixels raised off the ground (a hop).
  lift?: number
  // Hurt: drawn all white while above zero.
  flash?: number
  // Rage: drawn hot red.
  isRaging?: boolean
  // Giant: drawn this many pixel rows tall.
  height?: number
}

const RAGE_PALETTE = { ...HERO_PALETTE, o: 0xff4d2e }
const FLASH_PALETTE = Object.fromEntries(Object.keys(HERO_PALETTE).map(key => [key, 0xffffff]))

// Draws Clawd standing on `ground`, its body's left edge at `x`; answers the
// rows it took and the scale it was drawn at.
export const drawHero = (
  canvas: Canvas,
  pose: Pose,
  facing: 1 | -1,
  x: number,
  ground: number,
  look: HeroLook = {},
) => {
  const { rows, left } = poseFacing(pose, facing, x)
  const scale = look.height === undefined ? 1 : look.height / POSE_ROWS
  const drawn = scale === 1 ? rows : scaleSprite(rows, look.height!)
  const shift = facing > 0 ? 0 : Math.round((POSE_WIDTH - BODY_WIDTH) * (1 - scale))
  const palette = (look.flash ?? 0) > 0 ? FLASH_PALETTE : look.isRaging ? RAGE_PALETTE : HERO_PALETTE
  const top = ground - drawn.length - Math.round(look.lift ?? 0)

  plotSprite(canvas, drawn, palette, Math.round(left + shift), top)

  return { top, scale }
}
