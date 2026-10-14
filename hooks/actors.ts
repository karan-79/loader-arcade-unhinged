// The -img styles: the same fights, with each character a picture (built by
// tools/build-assets.py into assets/img) placed over the strip of effects. A
// mode lists its actors; the band draws each as an Image at its cell.

import type { Pose } from './hero'
import { rivalAt, widthOf } from './rivals'

export type Actor = {
  key: string
  // Under assets/img.
  file: string
  left: number
  top: number
  columns: number
  rows: number
}

// Each picture is 8 pixels per sprite pixel, so a sprite pixel row is half a
// cell: a top at pixel row `y` is cell row y / 2.
export const cellTop = (y: number) => Math.round(y / 2)

// A stable key per character object, so its picture is placed, not redrawn.
const ids = new WeakMap<object, number>()
let nextId = 0

export const keyOf = (character: object) => {
  let id = ids.get(character)

  if (id === undefined) {
    id = nextId++
    ids.set(character, id)
  }

  return `actor-${id}`
}

export type RivalFrame = 'walk-0' | 'walk-1' | 'hurt' | 'ko'

export const walkFrame = (stride: number): RivalFrame => (Math.floor(stride) % 2 === 0 ? 'walk-0' : 'walk-1')

// A rival's picture: a frame, a helmet (1 army, 2 steel), facing right or not.
export const rivalFile = (rival: number, frame: RivalFrame, helmet = 0, isFacingRight = false) =>
  `rivals/${rivalAt(rival).id}/${frame}${helmet > 0 && frame !== 'ko' ? `-h${helmet}` : ''}${isFacingRight ? '-r' : ''}.png`

// A rival picture `rows` cells tall keeps its sprite's shape at this width.
export const rivalColumns = (rival: number, rows = 4) => Math.max(1, Math.round((widthOf(rivalAt(rival)) * rows) / 4))

export type HeroLookName = 'plain' | 'flash' | 'rage'

export const heroFile = (pose: Pose | 'bazooka', look: HeroLookName = 'plain', facing: 1 | -1 = 1) =>
  pose === 'bazooka'
    ? 'hero/bazooka.png'
    : `hero/${pose}${look === 'plain' ? '' : `-${look}`}${facing < 0 ? '-l' : ''}.png`
