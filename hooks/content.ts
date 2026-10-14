// What the arcade is made of, as data: the rival roster and every line anyone
// says. content/default.json ships with the plugin (tools/build-content.py
// turns it into default-content.ts); a person's own file, in the same shape
// and as partial as they like, is laid over it at session start. See
// CONTENT.md for the format.

import { setLines } from './banter'
import { DEFAULT_CONTENT } from './default-content'
import type { Rival } from './rivals'
import { DEFAULT_ROSTER, parseColor, setRoster } from './rivals'

export type RivalContent = {
  id: string
  label: string
  weight: number
  sprite: string[]
  palette: Record<string, string>
  taunts: string[]
}

export type HeroLines = {
  streak: string[]
  hurt: string[]
  swarm: string[]
  bossDown: string[]
  reply: string[]
  meh: string[]
  fire: string[]
  finisher: string[]
  parry: string[]
  powerUp: string[]
  ready: string[]
  spotted: string[]
  outro: string[]
  ultimate: { inferno: string; holy: string }
  weapon: { sword: string; axe: string; spear: string; hammer: string; daggers: string; staff: string }
  dojoPower: { rage: string; giant: string }
  power: { spread: string; rapid: string; laser: string; missile: string; tank: string; chopper: string }
}

export type Lines = {
  hero: HeroLines
  rivals: { generic: string[]; helmet: string[]; swarm: string[]; flee: string[]; duel: string[]; thrown: string[]; scout: string[] }
  boss: { intro: string[]; brag: string[]; ramble: string[]; scared: string[]; down: string[] }
}

export type Content = { rivals: RivalContent[]; lines: Lines }

// Where a person's own content lives, under their home directory.
export const CONTENT_PATH = '.claude/loader-arcade-unhinged/content.json'

const MAX_WIDTH = 9
const MAX_HEIGHT = 7
const MAX_LINE = 60
const COLOR = /^#[0-9a-f]{6}$/i

type Bag = Record<string, unknown>

const isBag = (value: unknown): value is Bag => typeof value === 'object' && value !== null && !Array.isArray(value)
const isLine = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_LINE
const isLines = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.every(isLine)
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

const checkSprite = (sprite: unknown, palette: Record<string, string>) => {
  if (!Array.isArray(sprite) || sprite.length === 0 || sprite.length > MAX_HEIGHT) {
    return `sprite needs 1 to ${MAX_HEIGHT} rows`
  }

  const width = String(sprite[0]).length
  if (width < 3 || width > MAX_WIDTH || sprite.some(row => typeof row !== 'string' || row.length !== width)) {
    return `sprite rows must be strings of one length, 3 to ${MAX_WIDTH} wide`
  }

  const stray = [...new Set(sprite.join(''))].filter(pixel => pixel !== '.' && !(pixel in palette))
  return stray.length > 0 ? `sprite uses ${stray.join(', ')} with no colour in palette` : undefined
}

const checkPalette = (palette: unknown) => {
  if (!isBag(palette) || Object.keys(palette).length === 0) {
    return 'palette needs at least one colour'
  }

  const bad = Object.entries(palette).filter(([key, color]) => key.length !== 1 || key === '.' || typeof color !== 'string' || !COLOR.test(color))
  return bad.length > 0 ? `palette entries must be one character to "#rrggbb" (${bad.map(([key]) => key).join(', ')})` : undefined
}

// One rival from a content file: a change to one already there (by id) or a new one.
const mergeRival = (raw: Bag, roster: ReadonlyMap<string, RivalContent>, warnings: string[]): RivalContent | undefined => {
  const id = raw.id
  if (typeof id !== 'string' || id.length === 0) {
    warnings.push('a rival has no "id"; skipped')
    return undefined
  }

  const base = roster.get(id)
  const palette = isBag(raw.palette) ? (raw.palette as Record<string, string>) : base?.palette
  const sprite = raw.sprite ?? base?.sprite
  const label = raw.label ?? base?.label ?? id.toUpperCase()
  const weight = raw.weight ?? base?.weight ?? 1
  const taunts = raw.taunts ?? base?.taunts ?? []

  const problem =
    checkPalette(palette) ??
    checkSprite(sprite, palette ?? {}) ??
    (typeof label !== 'string' || label.length === 0 || label.length > 20 ? 'label must be 1 to 20 characters' : undefined) ??
    (typeof weight !== 'number' || weight < 0 || weight > 10 ? 'weight must be a number from 0 to 10' : undefined) ??
    (!Array.isArray(taunts) || !taunts.every(isLine) ? `taunts must be lines of up to ${MAX_LINE} characters` : undefined)

  if (problem !== undefined) {
    warnings.push(`rival "${id}": ${problem}; ${base === undefined ? 'skipped' : 'kept the built-in one'}`)
    return base
  }

  return { id, label: label as string, weight: weight as number, sprite: sprite as string[], palette: palette as Record<string, string>, taunts: taunts as string[] }
}

const toRival = (rival: RivalContent, defaults: ReadonlyMap<string, RivalContent>): Rival => {
  const base = defaults.get(rival.id)
  const isUnchanged =
    base !== undefined &&
    JSON.stringify(base.sprite) === JSON.stringify(rival.sprite) &&
    JSON.stringify(base.palette) === JSON.stringify(rival.palette)

  return {
    id: rival.id,
    label: rival.label,
    weight: rival.weight,
    sprite: rival.sprite,
    palette: Object.fromEntries(Object.entries(rival.palette).map(([key, color]) => [key, parseColor(color)])),
    taunts: rival.taunts,
    hasPicture: isUnchanged,
  }
}

// Lays a section of lines over the defaults: a list replaces a list, a line
// replaces a line, anything else is reported and left as it was.
const mergeLines = (target: Bag, raw: unknown, where: string, warnings: string[]) => {
  if (!isBag(raw)) {
    warnings.push(`${where} should be an object; ignored`)
    return
  }

  for (const [key, value] of Object.entries(raw)) {
    const current = target[key]

    if (current === undefined) {
      warnings.push(`${where}.${key} is not a line set this arcade uses; ignored`)
    } else if (Array.isArray(current)) {
      if (isLines(value)) {
        target[key] = value
      } else {
        warnings.push(`${where}.${key} should be a list of lines up to ${MAX_LINE} characters; kept the built-in`)
      }
    } else if (isBag(current)) {
      mergeLines(current, value, `${where}.${key}`, warnings)
    } else if (isLine(value)) {
      target[key] = value
    } else {
      warnings.push(`${where}.${key} should be one line up to ${MAX_LINE} characters; kept the built-in`)
    }
  }
}

// Lays one file of content over what is there so far: rivals by id, lines
// set by set. `from` names the file in what it reports.
const layContent = (raw: unknown, roster: Map<string, RivalContent>, lines: Lines, from: string, warnings: string[]) => {
  const notes: string[] = []

  if (!isBag(raw)) {
    warnings.push(`${from}: should hold one JSON object; ignored`)
    return
  }

  for (const key of Object.keys(raw)) {
    if (key !== 'rivals' && key !== 'lines' && !key.startsWith('$')) {
      notes.push(`"${key}" is not something this arcade reads; ignored`)
    }
  }

  if (raw.rivals !== undefined) {
    if (!Array.isArray(raw.rivals)) {
      notes.push('"rivals" should be a list')
    } else {
      for (const entry of raw.rivals) {
        const rival = isBag(entry) ? mergeRival(entry, roster, notes) : undefined
        if (rival !== undefined) {
          roster.set(rival.id, rival)
        }
      }
    }
  }

  if (raw.lines !== undefined) {
    mergeLines(lines as unknown as Bag, raw.lines, 'lines', notes)
  }

  warnings.push(...notes.map(note => (from === '' ? note : `${from}: ${note}`)))
}

// Applies the built-in content with `raw` (the person's parsed file, or
// undefined) laid over it; answers what was wrong with the file.
export const applyContent = (raw: unknown): string[] => {
  const warnings: string[] = []
  const defaults = new Map(DEFAULT_CONTENT.rivals.map(rival => [rival.id, rival]))
  const roster = new Map(DEFAULT_CONTENT.rivals.map(rival => [rival.id, rival]))
  const lines = copy(DEFAULT_CONTENT.lines)

  if (raw !== undefined) {
    layContent(raw, roster, lines, '', warnings)
  }

  const rivals = [...roster.values()].map(rival => toRival(rival, defaults))
  setRoster(rivals.some(rival => rival.weight > 0) ? rivals : DEFAULT_ROSTER)
  setLines(lines)

  if (!rivals.some(rival => rival.weight > 0)) {
    warnings.push('every rival has weight 0; using the built-in roster')
  }

  return warnings
}
