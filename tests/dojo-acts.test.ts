import { expect, test } from 'claude-code/testing'

import { DEFAULT_PACING, actAt } from '../hooks/acts'
import { WAVE_KOS } from '../hooks/arena'
import { beginDojoTurn, createDojo, dojoActors, dojoCells, endDojoTurn, stepDojo } from '../hooks/dojo'

const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647
const FRAME = 0.066
const COLUMNS = 100

// Plays a turn the way the band does: the act follows the clock.
const playTurn = (seed: number, seconds: number, watch: (dojo: ReturnType<typeof createDojo>, at: number) => void) => {
  const dojo = createDojo()
  const random = seeded(seed)
  beginDojoTurn(dojo, COLUMNS, random)

  for (let at = 0; at < seconds; at += FRAME) {
    dojo.act = actAt(at, DEFAULT_PACING)
    stepDojo(dojo, FRAME, COLUMNS, random)
    watch(dojo, at)
  }

  return { dojo, random }
}

test('the dojo turn trains alone, then something happens, then the fight is on', async () => {
  for (const seed of [3, 5, 8, 13, 21, 34]) {
    let foesInPrelude = 0
    let sawIncident = false
    let sawFight = false
    let bossTooSoon = false

    const { dojo } = playTurn(seed, 7.9, (dojo, at) => {
      if (at < 0.9) {
        foesInPrelude += dojo.foes.length
        expect(dojo.drill).not.toBe(null)
      } else if (at < 3) {
        sawIncident ||= dojo.foes.length > 0
      } else {
        sawFight ||= dojo.foes.some(foe => foe.state === 'ko')
      }

      bossTooSoon ||= dojo.boss !== null
    })

    expect(foesInPrelude).toBe(0)
    expect(sawIncident).toBe(true)
    expect(sawFight).toBe(true)
    expect(bossTooSoon).toBe(false)
    expect(dojoCells(dojo, COLUMNS, 5).length).toBeGreaterThan(0)
    expect(dojoActors(dojo).length).toBeGreaterThan(0)
  }
})

test('a boss earned early waits for the set piece', async () => {
  const dojo = createDojo()
  const random = seeded(17)
  dojo.waves.wave = 2
  dojo.waves.waveKos = WAVE_KOS - 1
  beginDojoTurn(dojo, COLUMNS, random)
  let bossBefore = false
  let bossAfter = false

  for (let at = 0; at < 9; at += FRAME) {
    dojo.act = actAt(at, DEFAULT_PACING)
    stepDojo(dojo, FRAME, COLUMNS, random)

    if (at < 8) {
      bossBefore ||= dojo.boss !== null
    } else {
      bossAfter ||= dojo.boss !== null
    }
  }

  expect(bossBefore).toBe(false)
  expect(dojo.lastSetPiece).toBe('boss')
  expect(bossAfter).toBe(true)
})

test('every set piece brings something big', async () => {
  for (const seed of [2, 4, 6, 10, 12]) {
    let foesAtStart = 0
    let peak = 0
    let sawBig = false

    playTurn(seed, 10, (dojo, at) => {
      if (at < 8) {
        foesAtStart = dojo.foes.filter(foe => foe.state !== 'ko').length
        return
      }

      peak = Math.max(peak, dojo.foes.filter(foe => foe.state !== 'ko').length)
      sawBig ||= dojo.boss !== null || dojo.drops.length > 0 || dojo.power !== null || peak >= foesAtStart + 3
    })

    expect(sawBig).toBe(true)
  }
})

test('the dojo clears when the turn ends', async () => {
  for (const seed of [1, 7, 9]) {
    const { dojo, random } = playTurn(seed, 12, () => undefined)
    endDojoTurn(dojo, COLUMNS, random)

    for (let at = 0; at < 1.7; at += FRAME) {
      stepDojo(dojo, FRAME, COLUMNS, random)
    }

    expect(dojo.foes.length).toBe(0)
    expect(dojo.boss).toBe(null)
  }
})

test('the progress carries over to the next turn, with a fresh prelude', async () => {
  const { dojo, random } = playTurn(5, 12, () => undefined)
  const kos = dojo.waves.kos
  const prelude = dojo.lastPrelude
  endDojoTurn(dojo, COLUMNS, random)
  beginDojoTurn(dojo, COLUMNS, random)

  expect(kos).toBeGreaterThan(0)
  expect(dojo.waves.kos).toBe(kos)
  expect(dojo.foes.length).toBe(0)
  expect(dojo.drill?.kind).not.toBe(prelude)
})
