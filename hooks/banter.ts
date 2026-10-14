// What everyone says in Clawd's fights. The lines come from content (see
// content.ts): Clawd's quips, rivals' trash talk, and boss exchanges that
// sometimes run long enough to earn a bazooka.

import type { BazookaTalk, BossTalk, Lines } from './content'
import { DEFAULT_CONTENT } from './default-content'
import { rivals } from './rivals'

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

// Live line sets, replaced in place when content loads so every reader sees them.
export const HERO_LINES: Lines['hero'] = copy(DEFAULT_CONTENT.lines.hero)
export const RIVAL_LINES: Lines['rivals'] = copy(DEFAULT_CONTENT.lines.rivals)
export const BOSS_LINES: Lines['boss'] = copy(DEFAULT_CONTENT.lines.boss)
export const SCENES: Lines['scenes'] = copy(DEFAULT_CONTENT.lines.scenes)

export const setLines = (lines: Lines) => {
  Object.assign(HERO_LINES, lines.hero)
  Object.assign(RIVAL_LINES, lines.rivals)
  Object.assign(BOSS_LINES, lines.boss)
  Object.assign(SCENES, lines.scenes)
}

export const pick = (lines: readonly string[], random: () => number) =>
  lines[Math.floor(random() * lines.length)] ?? lines[0] ?? ''

// A rival's own taunt most of the time, the crowd's otherwise.
export const tauntFor = (id: string, random: () => number) => {
  const own = rivals().find(rival => rival.id === id)?.taunts ?? []

  return pick(own.length > 0 && random() < 0.7 ? own : RIVAL_LINES.generic, random)
}

export const named = (line: string, name: string) => line.replaceAll('{name}', name)

// One exchange, picked at random, with `{name}` filled in throughout.
const scene = <T extends Record<string, string | string[]>>(scenes: readonly T[], name: string, random: () => number): T => {
  const picked = scenes[Math.floor(random() * scenes.length)] ?? scenes[0]!
  return Object.fromEntries(
    Object.entries(picked).map(([key, line]) => [key, Array.isArray(line) ? line.map(each => named(each, name)) : named(line, name)]),
  ) as T
}

export const bossTalk = (name: string, random: () => number): BossTalk => scene(SCENES.bossTalk, name, random)

export const bazookaTalk = (name: string, random: () => number): BazookaTalk => scene(SCENES.bazooka, name, random)
