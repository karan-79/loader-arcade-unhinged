import { expect, test } from 'claude-code/testing'

import { DEFAULT_PACING, actAt } from '../hooks/acts'
import { beginKnightTurn, createKnight, endKnightTurn, knightActors, knightCells, stepKnight } from '../hooks/knight'
import type { Knight } from '../hooks/knight'

const FRAME = 0.066
const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647
const cellsLength = (columns: number, rows: number) => Math.ceil((columns * rows * 12) / 3) * 4

// Plays a turn from `from` to `to` seconds, the act following the clock.
const play = (knight: Knight, from: number, to: number, random: () => number, each: (seconds: number) => void = () => undefined) => {
  for (let seconds = from; seconds < to; seconds += FRAME) {
    knight.act = actAt(seconds, DEFAULT_PACING)
    stepKnight(knight, FRAME, 100, random)
    each(seconds)
  }
}

test('a knight turn goes prelude, incident, then a duel within a few seconds', async () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const knight = createKnight()
    const random = seeded(seed)
    let incidentAt = -1
    let duelAt = -1

    beginKnightTurn(knight, 100, random)
    expect(knight.prelude).not.toBe(null)

    play(knight, 0, 6, random, seconds => {
      if (seconds < DEFAULT_PACING[0] - FRAME) {
        expect(knight.foe).toBe(null)
      }
      if (incidentAt < 0 && knight.incident !== null) incidentAt = seconds
      if (duelAt < 0 && knight.phase === 'duel') duelAt = seconds
      expect(knight.foe?.isBoss ?? false).toBe(false)
      expect(knightCells(knight, 100, 5).length).toBe(cellsLength(100, 5))
      expect(knightActors(knight).length).toBeGreaterThan(0)
    })

    expect(incidentAt).toBeGreaterThanOrEqual(DEFAULT_PACING[0] - FRAME)
    expect(incidentAt).toBeLessThan(DEFAULT_PACING[0] + 0.2)
    expect(duelAt).toBeGreaterThan(0)
    expect(duelAt).toBeLessThan(4)
  }
})

test('preludes and incidents vary and never repeat back to back', async () => {
  const knight = createKnight()
  const random = seeded(21)
  const preludes: string[] = []
  const incidents: string[] = []

  for (let turn = 0; turn < 24; turn++) {
    beginKnightTurn(knight, 100, random)
    preludes.push(knight.prelude ?? '')
    play(knight, 0, 1.2, random)
    incidents.push(knight.incident ?? knight.lastIncident ?? '')
    endKnightTurn(knight, 100, random)
    play(knight, 1.2, 2.4, random)
  }

  expect(new Set(preludes).size).toBe(5)
  expect(new Set(incidents).size).toBe(4)
  for (let i = 1; i < preludes.length; i++) {
    expect(preludes[i]).not.toBe(preludes[i - 1])
    expect(incidents[i]).not.toBe(incidents[i - 1])
  }
})

test('a boss due early waits for the set piece, then comes', async () => {
  const knight = createKnight()
  const random = seeded(5)
  let bossAt = -1

  // The next duel would be the fourth: a boss.
  knight.duels = 3
  beginKnightTurn(knight, 100, random)

  play(knight, 0, 16, random, seconds => {
    if (bossAt < 0 && knight.foe?.isBoss) bossAt = seconds
  })

  expect(bossAt).toBeGreaterThanOrEqual(DEFAULT_PACING[2] - FRAME)
  expect(bossAt).toBeLessThan(14)
})

test('the session carries over between turns', async () => {
  const knight = createKnight()
  const random = seeded(9)

  beginKnightTurn(knight, 100, random)
  play(knight, 0, 10, random)
  const { kos, duels } = knight
  expect(kos).toBeGreaterThan(0)

  endKnightTurn(knight, 100, random)
  play(knight, 10, 11.2, random)
  beginKnightTurn(knight, 100, random)

  expect(knight.kos).toBeGreaterThanOrEqual(kos)
  expect(knight.duels).toBeGreaterThanOrEqual(duels)
  expect(knight.foe).toBe(null)
  expect(knight.phase).toBe('calm')
})

test('the outro clears the field within a second and a half', async () => {
  for (const [seed, endAt] of [[3, 1.5], [4, 2.5], [5, 4.5], [6, 9], [7, 12]] as const) {
    const knight = createKnight()
    const random = seeded(seed)

    beginKnightTurn(knight, 100, random)
    play(knight, 0, endAt, random)
    endKnightTurn(knight, 100, random)
    expect(knight.chat.bubbles.length + knight.chat.pending.length).toBeGreaterThan(0)

    // The clock stops moving acts on once the turn is over.
    for (let seconds = 0; seconds < 1.5; seconds += FRAME) {
      stepKnight(knight, FRAME, 100, random)
    }

    expect(knight.foe).toBe(null)
    expect(knight.scout).toBe(null)
  }
})
