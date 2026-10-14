// Plays the arcade for the README's GIF: a shooter turn whose company boss
// talks and meets the bazooka, then a stretch of the campfire. Writes the
// frames, as Raster cells, for tools/demo-gif.py.
//
//   npx tsx tools/demo-frames.ts /tmp/frames.json
import { writeFileSync } from 'node:fs'

import { DEFAULT_PACING, actAt } from '../hooks/acts'
import { ARENA_ROWS } from '../hooks/arena'
import { beginCampfire, campfireCells, createCampfire, stepCampfire } from '../hooks/campfire'
import { applyContent } from '../hooks/content'
import { rivalAt } from '../hooks/rivals'
import { beginShooterTurn, createShooter, shooterCells, stepShooter } from '../hooks/shooter'

const COLUMNS = 96
const STEP = 0.066
const COMPANIES = ['closedai', 'hugging-fake', 'kodex', 'gemenai', 'meh-ta', 'mistrale', 'grokk', 'deepseep', 'cursr', 'co-pilout', 'perplexed', 'qwhen']

const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647

applyContent(undefined)

const frames: { cells: string; rows: number; word: string }[] = []

// The first seed whose boss is a company and gets the bazooka.
for (let seed = 1; seed < 400 && frames.length === 0; seed++) {
  const random = seeded(seed)
  const shooter = createShooter()
  beginShooterTurn(shooter, COLUMNS, random)
  const cells: string[] = []
  let first = -1
  let last = -1
  let isBazooka = false
  let boss = ''

  for (let i = 0; i < 26 / STEP; i++) {
    shooter.act = actAt(i * STEP, DEFAULT_PACING)
    stepShooter(shooter, STEP, COLUMNS, random)
    cells.push(shooterCells(shooter, COLUMNS, ARENA_ROWS))
    if (shooter.scene.length > 0) {
      first = first < 0 ? i : first
      last = i
      isBazooka ||= shooter.scene.some(line => line.action === 'raise')
      boss = shooter.boss === null ? boss : rivalAt(shooter.boss.rival).id
    }
  }

  if (first > 0 && isBazooka && first * STEP < 20 && COMPANIES.includes(boss)) {
    const from = Math.max(0, first - Math.round(2.5 / STEP))
    const to = Math.min(cells.length, last + Math.round(2.2 / STEP))
    frames.push(...cells.slice(from, to).map(frame => ({ cells: frame, rows: ARENA_ROWS, word: 'Boss hunting' })))
  }
}

const campfire = createCampfire()
const random = seeded(11)
beginCampfire(campfire)
for (let i = 0; i < 17 / STEP; i++) {
  const seconds = i * STEP
  const act = actAt(seconds, DEFAULT_PACING)
  if (campfire.act !== act) {
    campfire.actSeconds = 0
  }
  campfire.act = act
  stepCampfire(campfire, STEP, COLUMNS, random)
  if ((seconds > 2.4 && seconds < 8.6) || (seconds > 12.5 && seconds < 16.5)) {
    frames.push({ cells: campfireCells(campfire, COLUMNS, 5), rows: 5, word: seconds < 9 ? 'Roasting marshmallows' : 'Stargazing' })
  }
}

writeFileSync(process.argv[2] ?? 'frames.json', JSON.stringify({ columns: COLUMNS, frames }))
console.log(`${frames.length} frames`)
