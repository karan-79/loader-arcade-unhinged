// The rivals: tiny pixel characters that run on little legs. The roster comes
// from content (content/default.json, then the person's own file); `weight`
// sets how often each one shows up, 0 to bench it.

import { DEFAULT_CONTENT } from './default-content'

export type Rival = {
  id: string
  label: string
  weight: number
  sprite: readonly string[]
  palette: Readonly<Record<string, number>>
  taunts: readonly string[]
  // True when assets/img holds pictures drawn from exactly this sprite.
  hasPicture: boolean
}

export const parseColor = (color: string) => Number.parseInt(color.replace('#', ''), 16)

const fromContent = (rival: (typeof DEFAULT_CONTENT.rivals)[number]): Rival => ({
  id: rival.id,
  label: rival.label,
  weight: rival.weight,
  sprite: rival.sprite,
  palette: Object.fromEntries(Object.entries(rival.palette).map(([key, color]) => [key, parseColor(color)])),
  taunts: rival.taunts,
  hasPicture: true,
})

export const DEFAULT_ROSTER: readonly Rival[] = DEFAULT_CONTENT.rivals.map(fromContent)

let roster: readonly Rival[] = DEFAULT_ROSTER
let totalWeight = 0

export const setRoster = (rivals: readonly Rival[]) => {
  roster = rivals.length > 0 ? rivals : DEFAULT_ROSTER
  totalWeight = roster.reduce((sum, rival) => sum + rival.weight, 0)
}

setRoster(DEFAULT_ROSTER)

export const rivals = () => roster

// Picks a rival's index by weight.
export const pickRival = (random: () => number) => {
  let left = random() * totalWeight

  for (let index = 0; index < roster.length; index++) {
    left -= roster[index]?.weight ?? 0

    if (left < 0) {
      return index
    }
  }

  return 0
}

export const rivalAt = (index: number): Rival => roster[index] ?? roster[0]!

export const LEG_COLOR = 0x9a9a9a

export const widthOf = (rival: Rival) => rival.sprite[0]?.length ?? 5

export const legsOf = (width: number, stride: number) => {
  const middle = Math.floor(width / 2)
  const spread = Math.floor(stride) % 2 === 0 ? 1 : 2

  return [...Array(width)]
    .map((_, x) => (x === middle - spread || x === middle + spread ? 'l' : '.'))
    .join('')
}

// A sprite scaled by nearest neighbour to `height` pixel rows (a boss).
export const scaleSprite = (sprite: readonly string[], height: number) => {
  const factor = height / sprite.length
  const width = Math.round((sprite[0]?.length ?? 0) * factor)

  return [...Array(height)].map((_, y) =>
    [...Array(width)]
      .map((_, x) => sprite[Math.floor(y / factor)]?.[Math.floor(x / factor)] ?? '.')
      .join(''),
  )
}
