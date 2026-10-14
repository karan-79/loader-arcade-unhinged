// What everyone says in Pinch's fights. The lines come from content (see
// content.ts): Pinch's quips, rivals' trash talk, and boss monologues that
// sometimes run long enough to earn a bazooka.

import type { Lines } from './content'
import { DEFAULT_CONTENT } from './default-content'
import { rivals } from './rivals'

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

// Live line sets, replaced in place when content loads so every reader sees them.
export const HERO_LINES: Lines['hero'] = copy(DEFAULT_CONTENT.lines.hero)
export const RIVAL_LINES: Lines['rivals'] = copy(DEFAULT_CONTENT.lines.rivals)
export const BOSS_LINES: Lines['boss'] = copy(DEFAULT_CONTENT.lines.boss)

export const setLines = (lines: Lines) => {
  Object.assign(HERO_LINES, lines.hero)
  Object.assign(RIVAL_LINES, lines.rivals)
  Object.assign(BOSS_LINES, lines.boss)
}

export const pick = (lines: readonly string[], random: () => number) =>
  lines[Math.floor(random() * lines.length)] ?? lines[0] ?? ''

// A rival's own taunt most of the time, the crowd's otherwise.
export const tauntFor = (id: string, random: () => number) => {
  const own = rivals().find(rival => rival.id === id)?.taunts ?? []

  return pick(own.length > 0 && random() < 0.7 ? own : RIVAL_LINES.generic, random)
}

export const named = (line: string, name: string) => line.replace('{name}', name)
