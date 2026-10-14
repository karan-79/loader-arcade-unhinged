import { expect, test } from 'claude-code/testing'

import type { Act } from '../hooks/acts'
import { DEFAULT_PACING, actAt } from '../hooks/acts'
import { beginShooterTurn, createShooter, endShooterTurn, shooterCells, stepShooter } from '../hooks/shooter'
import type { Shooter } from '../hooks/shooter'

const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647
const FRAME = 0.066
const COLUMNS = 100

// Steps a turn from `from` to `to` seconds, the act following the clock.
const play = (shooter: Shooter, from: number, to: number, random: () => number, watch: (act: Act) => void = () => undefined) => {
  for (let seconds = from; seconds < to; seconds += FRAME) {
    shooter.act = actAt(seconds, DEFAULT_PACING)
    stepShooter(shooter, FRAME, COLUMNS, random)
    watch(shooter.act)
  }
}

test('a shooter turn opens alone, then something happens, then the fight', async () => {
  for (const seed of [3, 5, 8, 21, 34]) {
    const shooter = createShooter()
    const random = seeded(seed)
    beginShooterTurn(shooter, COLUMNS, random)

    expect(shooter.prelude).not.toBe(null)
    play(shooter, 0, 0.95, random)
    expect(shooter.enemies.length).toBe(0)
    expect(shooter.boss).toBe(null)

    // By the end of act 1 the incident has put someone or something on the field.
    let sawIncident = false
    play(shooter, 0.95, 2.9, random, () => {
      sawIncident ||= shooter.enemies.length > 0 || shooter.airdrop !== null
    })
    expect(shooter.incident).not.toBe(null)
    expect(sawIncident).toBe(true)

    expect(shooterCells(shooter, COLUMNS, 5).length).toBe(Math.ceil((COLUMNS * 5 * 12) / 3) * 4)
  }
})

test('act 2 fights without bosses or swarms; act 3 brings the held-back boss', async () => {
  const shooter = createShooter()
  const random = seeded(17)
  // One knockout from a boss wave.
  shooter.waves.wave = 2
  shooter.waves.waveKos = 5
  beginShooterTurn(shooter, COLUMNS, random)

  let mostRivals = 0
  play(shooter, 0, 7.9, random, act => {
    if (act === 2) {
      expect(shooter.boss).toBe(null)
      mostRivals = Math.max(mostRivals, shooter.enemies.filter(enemy => enemy.ko === null).length)
    }
  })

  expect(shooter.waves.kos).toBeGreaterThan(0)
  expect(mostRivals).toBeLessThan(7)
  expect(shooter.isBossPending).toBe(true)

  play(shooter, 7.9, 8.2, random)
  expect(shooter.setPiece).toBe('boss')
  expect(shooter.boss).not.toBe(null)
})

test('every set piece is something big', async () => {
  const pieces = new Set<string>()

  for (let seed = 1; seed < 12; seed++) {
    const shooter = createShooter()
    const random = seeded(seed)
    beginShooterTurn(shooter, COLUMNS, random)
    shooter.waves.waveKos = 0
    play(shooter, 0, 8.1, random)

    if (!shooter.isBossPending || shooter.setPiece !== null) {
      pieces.add(shooter.setPiece ?? '')
      expect(shooter.boss !== null || shooter.airdrop !== null || shooter.drops.length > 0 || shooter.power !== null || shooter.enemies.length >= 7).toBe(true)
    }
  }

  expect(pieces.size).toBeGreaterThanOrEqual(2)
})

test('the outro clears the field and the next turn keeps the score', async () => {
  const shooter = createShooter()
  const random = seeded(29)
  beginShooterTurn(shooter, COLUMNS, random)
  play(shooter, 0, 12, random)

  const kos = shooter.waves.kos
  endShooterTurn(shooter, COLUMNS, random)
  expect(shooter.chat.bubbles.some(bubble => bubble.who === 'hero')).toBe(true)

  for (let seconds = 0; seconds < 1.5; seconds += FRAME) {
    stepShooter(shooter, FRAME, COLUMNS, random)
  }

  expect(shooter.enemies.length).toBe(0)
  expect(shooter.boss).toBe(null)

  const prelude = shooter.prelude
  beginShooterTurn(shooter, COLUMNS, random)
  expect(shooter.waves.kos).toBeGreaterThanOrEqual(kos)
  expect(shooter.enemies.length).toBe(0)
  expect(shooter.isOutro).toBe(false)
  // Never the same opening twice running (unless only one fits what Clawd holds).
  if (shooter.power === null) {
    expect(shooter.prelude).not.toBe(prelude)
  }
})
