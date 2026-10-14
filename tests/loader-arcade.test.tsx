import { expect, mock, test } from 'claude-code/testing'

import { DEFAULT_PACING, MIN_SAMPLES, actAt, pacingFor, pickFresh, remember } from '../hooks/acts'
import { beachCells, beachPicture, beginBeach, createBeach, stepBeach } from '../hooks/beach'
import { beginCruise, createCruise, cruiseCells, cruisePicture, stepCruise } from '../hooks/cruise'
import { beginMeditation, createMeditation, meditationCells, meditationPicture, stepMeditation } from '../hooks/meditation'
import { SCALE } from '../hooks/fine'
import { beginCampfire, campfireCells, campfirePicture, createCampfire, stepCampfire } from '../hooks/campfire'
import { createDojo, dojoCells, stepDojo } from '../hooks/dojo'
import { createKnight, knightCells, stepKnight } from '../hooks/knight'
import { createShooter, shooterCells, stepShooter } from '../hooks/shooter'
import { applyContent } from '../hooks/content'
import { HERO_LINES, SCENES, bazookaTalk, bossTalk } from '../hooks/banter'
import { DEFAULT_ROSTER, pickRival, rivals } from '../hooks/rivals'

const band = (isWorking: boolean) => ({
  hasSurvey: false,
  isWorking,
  maxRows: 10,
  bodyColumns: 60,
  scroll: { offset: 0, bodyRows: 10 },
  view: {},
})

const seeded = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647
const cellsLength = (columns: number, rows: number) => Math.ceil((columns * rows * 12) / 3) * 4

test('a turn moves through the acts, paced by default until it has learned', async () => {
  expect(pacingFor([])).toEqual(DEFAULT_PACING)
  expect(actAt(0, DEFAULT_PACING)).toBe(0)
  expect(actAt(1.5, DEFAULT_PACING)).toBe(1)
  expect(actAt(3, DEFAULT_PACING)).toBe(2)
  expect(actAt(9, DEFAULT_PACING)).toBe(3)
  expect(actAt(60, DEFAULT_PACING)).toBe(4)

  // Quick turns pull the arc in; long ones stretch it, within limits.
  const quick = pacingFor(Array.from({ length: MIN_SAMPLES }, () => 2))
  const slow = pacingFor(Array.from({ length: MIN_SAMPLES }, () => 40))
  expect(quick[1]).toBeLessThan(DEFAULT_PACING[1])
  expect(slow[1]).toBeGreaterThan(DEFAULT_PACING[1])
  expect(slow[0]).toBeLessThanOrEqual(1.2)
  expect(slow[3]).toBeLessThanOrEqual(DEFAULT_PACING[3] * 2.5)

  // Instant turns are not counted; only the latest are kept.
  expect(remember([], 0.2)).toEqual([])
  expect(remember(Array.from({ length: 40 }, () => 3), 9).length).toBe(30)

  const random = seeded(5)
  let last = 'a'
  for (let i = 0; i < 50; i++) {
    const next = pickFresh(['a', 'b', 'c'], last, random)
    expect(next).not.toBe(last)
    last = next
  }
})

test('the chill scenes play through every act', async () => {
  const random = seeded(9)
  const scenes = [
    { scene: createBeach(), begin: beginBeach, step: stepBeach, cells: beachCells, picture: beachPicture, rows: 5 },
    { scene: createCruise(), begin: beginCruise, step: stepCruise, cells: cruiseCells, picture: cruisePicture, rows: 4 },
    { scene: createMeditation(), begin: beginMeditation, step: stepMeditation, cells: meditationCells, picture: meditationPicture, rows: 5 },
    { scene: createCampfire(), begin: beginCampfire, step: stepCampfire, cells: campfireCells, picture: campfirePicture, rows: 5 },
  ] as const

  for (const { scene, begin, step, cells, picture, rows } of scenes) {
    begin(scene as never)
    for (let i = 0; i < 600; i++) {
      const act = actAt(i * 0.066, DEFAULT_PACING)
      if (scene.act !== act) scene.actSeconds = 0
      scene.act = act
      ;(step as (scene: unknown, seconds: number, columns: number, random: () => number) => void)(scene, 0.066, 90, random)
      if (i % 50 === 0) {
        expect((cells as (scene: unknown, columns: number, rows: number) => string)(scene, 90, rows).length).toBe(cellsLength(90, rows))
        const frame = (picture as (scene: unknown, columns: number, rows: number) => { rgba: string; width: number; height: number })(scene, 90, rows)
        expect([frame.width, frame.height]).toEqual([90 * SCALE, rows * 2 * SCALE])
        expect(frame.rgba.length).toBe(Math.ceil((frame.width * frame.height * 4) / 3) * 4)
      }
    }
    expect(scene.act).toBe(4)
  }
})

test('shooter climbs through waves into a boss fight', async () => {
  const shooter = createShooter()
  const random = seeded(7)
  let sawBoss = false
  let sawPower = false

  for (let i = 0; i < 3000; i++) {
    stepShooter(shooter, 0.066, 100, random)
    sawBoss ||= shooter.boss !== null
    sawPower ||= shooter.power !== null
  }

  expect(shooter.waves.wave).toBeGreaterThan(3)
  expect(sawBoss).toBe(true)
  expect(sawPower).toBe(true)
  expect(shooterCells(shooter, 100, 5).length).toBe(cellsLength(100, 5))
})

test('dojo fights from both sides, powers up and beats bosses', async () => {
  const dojo = createDojo()
  const random = seeded(11)
  const moves = new Set<string>()
  let sawBoss = false
  let sawPower = false

  for (let i = 0; i < 4000; i++) {
    stepDojo(dojo, 0.066, 100, random)
    if (dojo.move !== null) moves.add(dojo.move)
    sawBoss ||= dojo.boss !== null
    sawPower ||= dojo.power !== null
  }

  expect(dojo.isHome).toBe(true)
  expect(dojo.waves.wave).toBeGreaterThan(3)
  expect(moves.size).toBeGreaterThanOrEqual(4)
  expect(sawBoss).toBe(true)
  expect(sawPower).toBe(true)
  expect(dojoCells(dojo, 100, 5).length).toBe(cellsLength(100, 5))
})

test('knight wins each duel in a few seconds, bosses included', async () => {
  const knight = createKnight()
  const random = seeded(13)
  const phases = new Set<string>()
  let longest = 0
  let started = 0
  let sawFlame = false
  let longestBoss = 0
  let bossStarted = -1
  const weapons = new Set<string>()

  for (let i = 0; i < 6000; i++) {
    const before = knight.phase
    const wasBoss = knight.foe?.isBoss ?? false
    weapons.add(knight.weapon)

    if (before === 'enter' && wasBoss && bossStarted < 0) bossStarted = i
    if (bossStarted >= 0 && knight.foe === null) {
      longestBoss = Math.max(longestBoss, (i - bossStarted) * 0.066)
      bossStarted = -1
    }
    stepKnight(knight, 0.066, 100, random)
    phases.add(knight.phase)
    sawFlame ||= knight.flameDuels > 0

    if (before !== 'duel' && knight.phase === 'duel') started = i
    if (before === 'duel' && knight.phase !== 'duel' && !wasBoss) {
      longest = Math.max(longest, (i - started) * 0.066)
    }
  }

  for (const phase of ['enter', 'duel', 'powerup', 'ultimate', 'finisher', 'freeze', 'split', 'walkback']) {
    expect(phases.has(phase)).toBe(true)
  }
  expect(knight.kos).toBeGreaterThan(8)
  expect(longest).toBeLessThanOrEqual(11)
  expect(sawFlame).toBe(true)
  expect(longestBoss).toBeLessThan(9)
  expect(weapons.size).toBeGreaterThanOrEqual(5)
  expect(knightCells(knight, 100, 5).length).toBe(cellsLength(100, 5))
})

test('the heavier rivals show up more often', async () => {
  const counts = new Map<string, number>()
  let seed = 3
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647

  for (let i = 0; i < 4000; i++) {
    const id = rivals()[pickRival(random)]?.id ?? ''
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }

  expect(counts.size).toBe(DEFAULT_ROSTER.length)
  expect(counts.get('hallucinator') ?? 0).toBeGreaterThan(counts.get('null-pointer') ?? 0)
})

test("a person's content file adds rivals, changes lines, and reports mistakes", async () => {
  const notes = applyContent({
    rivals: [
      { id: 'hype-bot', weight: 0 },
      { id: 'yak', label: 'YAK SHAVER', sprite: ['.yyy.', 'ykyky', 'yyyyy'], palette: { y: '#c58b4b', k: '#141414' }, taunts: ['One more thing first...'] },
      { id: 'broken', sprite: ['abc'], palette: { a: 'red' } },
    ],
    lines: { hero: { streak: ['Easy money.'], weapon: { axe: 'Axe-ellent.' } }, nonsense: { x: ['y'] } },
  })

  const yak = rivals().find(rival => rival.id === 'yak')
  expect(yak?.label).toBe('YAK SHAVER')
  expect(yak?.hasPicture).toBe(false)
  expect(rivals().find(rival => rival.id === 'hype-bot')?.weight).toBe(0)
  expect(rivals().find(rival => rival.id === 'hallucinator')?.hasPicture).toBe(true)
  expect(rivals().some(rival => rival.id === 'broken')).toBe(false)
  expect(HERO_LINES.streak).toEqual(['Easy money.'])
  expect(HERO_LINES.weapon.axe).toEqual(['Axe-ellent.'])
  expect(HERO_LINES.weapon.sword).toContain('Sword of truth.')
  expect(notes.some(note => note.includes('"broken"'))).toBe(true)
  expect(notes.some(note => note.includes('nonsense'))).toBe(true)

  applyContent(undefined)
  expect(rivals().some(rival => rival.id === 'yak')).toBe(false)
  expect(HERO_LINES.streak).not.toEqual(['Easy money.'])
})

test('the animation plays above the prompt only while Claude works', async ($, on) => {
  mock.clock(on)
  on('ui.render', ($, e) => {
    const { Box } = $.ui.resolve(e)
    return <Box key="engine" />
  })

  const working = await $.ui.mount({
    plugin: 'loader-arcade-unhinged',
    surface: 'terminal',
    component: 'AbovePrompt',
    props: band(true),
  })
  const raster = await working.find({ type: 'Raster', key: 'arcade' })
  expect(raster?.props.columns).toBe(60)
  expect(raster?.props.rows).toBe(5)
  await working.unmount()

  for (const surface of ['terminal', 'desktop'] as const) {
    const idle = await $.ui.mount({
      plugin: 'loader-arcade-unhinged',
      surface,
      component: 'AbovePrompt',
      props: band(surface === 'desktop'),
    })
    expect(await idle.find({ type: 'Raster' })).toBeUndefined()
    await idle.unmount()
  }
})

test('boss exchanges come whole, picked at random, with the name filled in', () => {
  applyContent(undefined)
  expect(SCENES.bossTalk.length).toBeGreaterThanOrEqual(3)
  expect(SCENES.bazooka.length).toBeGreaterThanOrEqual(3)

  const seen = new Set<string>()
  for (let index = 0; index < SCENES.bossTalk.length; index++) {
    const talk = bossTalk('GROKK', () => (index + 0.5) / SCENES.bossTalk.length)
    expect(SCENES.bossTalk.some(scene => scene.reply.replaceAll('{name}', 'GROKK') === talk.reply)).toBe(true)
    expect(JSON.stringify(talk)).not.toContain('{name}')
    seen.add(talk.reply)
  }
  expect(seen.size).toBe(SCENES.bossTalk.length)
  expect(bazookaTalk('GROKK', () => 0).ramble.length).toBeGreaterThan(0)

  const notes = applyContent({
    lines: { scenes: { bossTalk: [{ intro: '{name}!', brag: 'Hi.', reply: 'Bye.' }], bazooka: [{ intro: 'only this' }] } },
  })
  expect(bossTalk('X', Math.random)).toEqual({ intro: 'X!', brag: 'Hi.', reply: 'Bye.' })
  expect(notes.some(note => note.includes('lines.scenes.bazooka'))).toBe(true)
  applyContent(undefined)
})
