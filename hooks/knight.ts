// knight: one-on-one duels. Each rival walks in, they trade blows,
// parrying with sparks, and after five to ten seconds Pinch dashes through it
// in one cut: a beat of stillness, then the rival falls apart in two. Pinch
// brings a different weapon to each duel (sword, axe, spear, hammer, twin
// daggers, or a staff that casts fireballs). Every fourth duel is a boss: a
// short exchange, then Pinch powers up and ends it with an ultimate, a giant
// fireball or a holy blade, and carries a flaming weapon for a few duels.
//
// A turn builds up in acts (see acts.ts): Pinch starts alone, practising on a
// straw dummy, sharpening its blade, picking a weapon off a rack, twirling or
// saluting; then something happens (a scout peeks in, an arrow lands, a noise,
// or a rival drops in for a quick duel); then the duels are on, with rivals
// running or dropping in close, and bosses wait for the set piece.

import type { Act } from './acts'
import { pickFresh } from './acts'
import type { Actor } from './actors'
import { cellTop, heroFile, keyOf, rivalColumns, rivalFile, walkFrame } from './actors'
import type { Pop, Ring, Speech, Spark } from './arena'
import {
  BOSS_HEIGHT,
  BOSS_VOICE,
  HERO_VOICE,
  GROUND,
  HIT_SPARKS,
  STEEL_SPARKS,
  between,
  burst,
  drawFoe,
  drawRings,
  drawSparks,
  hpBar,
  hudOverlays,
  pickFrom,
  popWord,
  rivalVoice,
  spriteOf,
  stepPops,
  stepRings,
  stepSparks,
} from './arena'
import { BOSS_LINES, HERO_LINES, RIVAL_LINES, named, pick, tauntFor } from './banter'
import type { Pose } from './hero'
import { BODY_WIDTH, POSE_ROWS, drawHero } from './hero'
import type { Canvas } from './raster'
import { clamp, createCanvas, mirror, mix, packCanvas, plot } from './raster'
import { legsOf, pickRival, rivalAt } from './rivals'
import type { Talk } from './talk'
import { createTalk, later, quip, say, stepTalk } from './talk'

type Phase = 'calm' | 'enter' | 'duel' | 'powerup' | 'ultimate' | 'finisher' | 'freeze' | 'split' | 'walkback'
export type Weapon = 'sword' | 'axe' | 'spear' | 'hammer' | 'daggers' | 'staff'
type Ultimate = 'inferno' | 'holy'
type Look = 'steel' | 'flame' | 'holy'
type Swing = { by: 'hero' | 'foe'; kind: 'slash' | 'thrust'; seconds: number; hasImpact: boolean }
type Prelude = 'dummy' | 'whetstone' | 'rack' | 'twirl' | 'salute'
type Incident = 'scout' | 'alarm' | 'quick' | 'arrow'
// How a rival arrives: walking in the full loop; earlier in a turn running in,
// or dropping in close, so a short turn still gets its fight.
type Entry = 'walk' | 'run' | 'drop'

const WEAPONS: Record<Weapon, { name: string; length: number; pace: number; thrust: number; lunge: number; words: readonly string[] }> = {
  sword: { name: 'SWORD', length: 7, pace: 1, thrust: 0.3, lunge: 2, words: ['SLASH', 'CUT!', 'HIT!'] },
  axe: { name: 'AXE', length: 7, pace: 1.25, thrust: 0, lunge: 2, words: ['CHOP!', 'THWACK', 'CLEAVE'] },
  spear: { name: 'SPEAR', length: 10, pace: 1, thrust: 0.8, lunge: 4, words: ['STAB!', 'POKE!', 'SKEWER'] },
  hammer: { name: 'HAMMER', length: 6, pace: 1.3, thrust: 0, lunge: 2, words: ['BONK!', 'SMASH!', 'CRUNCH'] },
  daggers: { name: 'DAGGERS', length: 4, pace: 0.6, thrust: 0.4, lunge: 3, words: ['SNIKT', 'SHINK', 'STAB!'] },
  staff: { name: 'FIRE STAFF', length: 8, pace: 1, thrust: 0, lunge: 0, words: ['BURN!', 'FWOOSH', 'TOASTY'] },
}
const HERO_WEAPONS: readonly Weapon[] = ['sword', 'sword', 'axe', 'spear', 'hammer', 'daggers', 'staff', 'staff']
const FOE_WEAPONS: readonly Weapon[] = ['sword', 'axe', 'spear']
const ULTIMATES: readonly Ultimate[] = ['inferno', 'holy']
const BLADES: readonly Weapon[] = ['sword', 'axe', 'spear', 'daggers']
const PRELUDES: readonly Prelude[] = ['dummy', 'whetstone', 'rack', 'twirl', 'salute']
const INCIDENTS: readonly Incident[] = ['scout', 'alarm', 'quick', 'arrow']

type Foe = {
  rival: number
  weapon: Weapon
  x: number
  hp: number
  maxHp: number
  isBoss: boolean
  flash: number
  stride: number
  parry: number
  entry: Entry
  // Pixels above the ground while dropping in.
  lift: number
  vy: number
  isFleeing: boolean
}

// The prelude's props: a straw dummy to hit and a rack to pick a weapon from.
type Dummy = { x: number; flash: number; wobble: number }
type Rack = { x: number; weapons: Weapon[] }
// A rival that peeks in during an incident and runs off again.
type Scout = { rival: number; x: number; stride: number; isLeaving: boolean }
type Arrow = { x: number; y: number; vx: number; vy: number; isStuck: boolean }

type Fireball = { x: number; y: number; vx: number; size: number; isUltimate: boolean }
type Half = { rows: readonly string[]; rival: number; x: number; top: number; vx: number; vy: number; age: number; isBurnt: boolean }
type TrailPoint = { x: number; y: number; age: number }

export type Knight = {
  duels: number
  kos: number
  phase: Phase
  phaseSeconds: number
  x: number
  home: number
  facing: 1 | -1
  stride: number
  weapon: Weapon
  foe: Foe | null
  swing: Swing | null
  untilSwing: number
  duelSeconds: number
  parry: number
  hurt: number
  flameDuels: number
  ultimate: Ultimate | null
  isBurnt: boolean
  dashFrom: number
  fireballs: Fireball[]
  trail: TrailPoint[]
  halves: Half[]
  sparks: Spark[]
  pops: Pop[]
  rings: Ring[]
  chat: Talk<'hero' | 'foe'>
  seconds: number
  // The turn's act, set from the clock; `lastAct` is the one already acted on.
  act: Act
  lastAct: Act
  prelude: Prelude | null
  lastPrelude: Prelude | undefined
  isPracticing: boolean
  // The weapon picked in the prelude, kept for the first duel.
  isWeaponPicked: boolean
  incident: Incident | null
  lastIncident: Incident | undefined
  incidentSeconds: number
  dummy: Dummy | null
  rack: Rack | null
  scout: Scout | null
  arrow: Arrow | null
  // A boss came due before the set piece, and waits for it.
  isBossDue: boolean
  isOutro: boolean
}

const HERO_TOP = GROUND - POSE_ROWS
const GAP = 9
const WALK_SPEED = 18 // pixels a second
const RUN_SPEED = 80
const FLEE_SPEED = 70
const DROP_HEIGHT = 12
const DROP_GRAVITY = 120
const DASH_SECONDS = 0.25
const FREEZE_SECONDS = 0.45
const SPLIT_SECONDS = 1.1
const SWING_SECONDS = 0.4
const WINDUP = 0.12
const STRIKE = 0.22
const IMPACT = 0.2
const GUARD_ANGLE = -0.7
const PARRY_ANGLE = -1.25
const BOSS_EVERY = 4
const BOSS_POWERUP_AT = 2.5
const POWERUP_SECONDS = 0.9
const CHARGE_SECONDS = 0.6
const HOLY_LENGTH = 15
const FLAME_DUELS = 3
const FIREBALL_SPEED = 60

const STEEL = { blade: 0xdfe6ee, tip: 0xffffff, hilt: 0xd4a017, haft: 0x8b5a2b, head: 0xb8c0cc }
const FLAME = [0xfff2a8, 0xffb347, 0xff6a2e, 0xe0301e]
const HOLY = [0xffffff, 0xfff6c8, 0xffe066, 0xffd21f]
const GOLD_SPARKS = [0xffffff, 0xffe066, 0xffd21f]
const TRAIL = 0xbfe9ff
const STRAW = [0xf0d878, 0xd9b44a, 0xb8902a]
const DUST = [0x9a8a6a, 0xb8a888]
const WOOD = 0x8b5a2b
const STONE = { top: 0xa8b0ba, side: 0x6c737c }
const DUMMY = ['.yyy.', '.yky.', 'bbbbb', '.yry.', '.yyy.', '.yyy.', '..b..', '..b..']
const DUMMY_PALETTE: Record<string, number> = { y: 0xd9b44a, k: 0x8a6a2a, r: 0xa0522d, b: WOOD }

export const createKnight = (): Knight => ({
  duels: 0,
  kos: 0,
  phase: 'enter',
  phaseSeconds: 0,
  x: -BODY_WIDTH,
  home: 0,
  facing: 1,
  stride: 0,
  weapon: 'sword',
  foe: null,
  swing: null,
  untilSwing: 0.6,
  duelSeconds: 7,
  parry: 0,
  hurt: 0,
  flameDuels: 0,
  ultimate: null,
  isBurnt: false,
  dashFrom: 0,
  fireballs: [],
  trail: [],
  halves: [],
  sparks: [],
  pops: [],
  rings: [],
  chat: createTalk(),
  seconds: 0,
  act: 4,
  lastAct: 4,
  prelude: null,
  lastPrelude: undefined,
  isPracticing: false,
  isWeaponPicked: false,
  incident: null,
  lastIncident: undefined,
  incidentSeconds: 0,
  dummy: null,
  rack: null,
  scout: null,
  arrow: null,
  isBossDue: false,
  isOutro: false,
})

const homeOf = (columns: number) => Math.round(columns * 0.3)
const foeHeight = (foe: Foe) => (foe.isBoss ? BOSS_HEIGHT : undefined)
const foeWidth = (foe: Foe) => spriteOf(foe.rival, foeHeight(foe))[0]?.length ?? 7
const standX = (knight: Knight) => knight.x + BODY_WIDTH + GAP
const foeCenter = (foe: Foe) => ({ x: foe.x + foeWidth(foe) / 2, y: GROUND - (foe.isBoss ? BOSS_HEIGHT : POSE_ROWS) / 2 })

const enter = (knight: Knight, phase: Phase) => {
  knight.phase = phase
  knight.phaseSeconds = 0
}

// A quick duel is the incident's: a rival drops in, a blow or two, one cut.
const spawnFoe = (knight: Knight, columns: number, random: () => number, isQuick = false) => {
  knight.duels += 1
  // Every fourth duel is a boss; one due before the set piece waits for it.
  const isDue = knight.duels % BOSS_EVERY === 0
  const isBoss = !isQuick && knight.act >= 3 && (isDue || knight.isBossDue)
  const hp = isBoss ? 12 : 3
  const entry: Entry = knight.act >= 4 && !isQuick ? 'walk' : isQuick || isBoss || random() < 0.5 ? 'drop' : 'run'

  knight.isBossDue = (knight.isBossDue || isDue) && !isBoss

  if (!knight.isWeaponPicked) {
    knight.weapon = pickFrom(HERO_WEAPONS, random)
  }
  knight.isWeaponPicked = false
  knight.foe = {
    rival: pickRival(random),
    weapon: pickFrom(FOE_WEAPONS, random),
    x: entry === 'drop' ? standX(knight) : columns,
    hp,
    maxHp: hp,
    isBoss,
    flash: 0,
    stride: 0,
    parry: 0,
    entry,
    lift: entry === 'drop' ? DROP_HEIGHT : 0,
    vy: 0,
    isFleeing: false,
  }
  knight.duelSeconds = knight.act >= 4 ? between(random, 5, 10) : isQuick ? between(random, 0.6, 0.9) : between(random, 2, 4)
  knight.isBurnt = false

  if (isBoss) {
    popWord(knight.pops, 'BOSS!', columns / 2)
  }
}

// A rival dropping in lands with a thud, a boss with a shockwave; one that
// lands on the training dummy flattens it.
const land = (knight: Knight, foe: Foe, random: () => number) => {
  const center = foe.x + foeWidth(foe) / 2

  burst(knight.sparks, center, GROUND - 1, foe.isBoss ? 16 : 8, DUST, random, 18, true)
  popWord(knight.pops, foe.isBoss ? 'BOOM!' : 'THUD!', center)

  if (foe.isBoss) {
    knight.rings.push({ x: center, y: GROUND - 1, age: 0.1 })
  }

  if (knight.dummy !== null) {
    burst(knight.sparks, knight.dummy.x + 2, GROUND - 4, 14, STRAW, random, 22)
    knight.dummy = null
  }
}

// Sends the rival running off to the right; it is gone at the edge.
const flee = (knight: Knight, foe: Foe, random: () => number) => {
  foe.isFleeing = true
  foe.lift = 0
  knight.swing = null
  knight.fireballs = []
  say(knight.chat, 'foe', foe.isBoss ? pick(BOSS_LINES.scared, random) : pick(RIVAL_LINES.flee, random), 1.2)
  enter(knight, 'calm')
}

// Pinch's weapon hand, by pose.
const heroHand = (knight: Knight, pose: Pose) => {
  const x = Math.round(knight.x)

  if (pose === 'punch') {
    return { x: x + 15, y: HERO_TOP + 4 }
  }

  if (pose === 'lift') {
    return { x: x + 11, y: HERO_TOP }
  }

  return { x: x + (knight.facing > 0 ? 11 : 0), y: HERO_TOP + 4 }
}

const foeHand = (foe: Foe) => ({ x: Math.round(foe.x) - 1, y: GROUND - (foe.isBoss ? 6 : 5) })

const paceOf = (knight: Knight, swing: Swing) => WEAPONS[swing.by === 'hero' ? knight.weapon : knight.foe?.weapon ?? 'sword'].pace

// The weapon's angle through a swing: wind up overhead, strike down, recover.
const swingAngle = (swing: Swing, pace: number) => {
  const t = swing.seconds / pace

  if (swing.kind === 'thrust') {
    return 0
  }

  if (t < WINDUP) {
    return GUARD_ANGLE + (-1.9 - GUARD_ANGLE) * (t / WINDUP)
  }

  if (t < STRIKE) {
    return -1.9 + 2.4 * ((t - WINDUP) / (STRIKE - WINDUP))
  }

  return 0.5 + (GUARD_ANGLE - 0.5) * clamp((t - STRIKE) / (SWING_SECONDS - STRIKE), 0, 1)
}

const angleOf = (knight: Knight, who: 'hero' | 'foe') => {
  if (knight.swing?.by === who) {
    return swingAngle(knight.swing, paceOf(knight, knight.swing))
  }

  return (who === 'hero' ? knight.parry : knight.foe?.parry ?? 0) > 0 ? PARRY_ANGLE : GUARD_ANGLE
}

// How far the attacker leans in on the strike.
const lunge = (knight: Knight, swing: Swing) => {
  const weapon = WEAPONS[swing.by === 'hero' ? knight.weapon : knight.foe?.weapon ?? 'sword']
  const reach = swing.kind === 'thrust' ? weapon.lunge + 1 : weapon.lunge

  return reach * Math.sin(Math.PI * clamp(swing.seconds / (SWING_SECONDS * weapon.pace), 0, 1))
}

const startSwing = (knight: Knight, random: () => number) => {
  const by = random() < 0.55 ? 'hero' : 'foe'
  const weapon = WEAPONS[by === 'hero' ? knight.weapon : knight.foe?.weapon ?? 'sword']

  knight.swing = { by, kind: random() < weapon.thrust ? 'thrust' : 'slash', seconds: 0, hasImpact: false }
}

const landOnFoe = (knight: Knight, foe: Foe, random: () => number) => {
  const words = WEAPONS[knight.weapon].words
  foe.hp = Math.max(0, foe.hp - (knight.flameDuels > 0 ? 2 : 1))
  foe.flash = 0.12
  foe.x += knight.weapon === 'hammer' ? 3 : 2
  burst(knight.sparks, foe.x, HERO_TOP + 3, 10, knight.flameDuels > 0 || knight.weapon === 'staff' ? FLAME : HIT_SPARKS, random, 20)
  popWord(knight.pops, pickFrom(words, random), foe.x + 3)

  if (knight.weapon === 'hammer') {
    knight.rings.push({ x: foe.x, y: GROUND - 1, age: 0.1 })
  }
}

const impact = (knight: Knight, foe: Foe, swing: Swing, random: () => number) => {
  const at = { x: (knight.x + BODY_WIDTH + foe.x) / 2, y: HERO_TOP + 3 }

  if (swing.by === 'hero') {
    // A staff casts instead of striking: the fireball lands or is blocked later.
    if (knight.weapon === 'staff') {
      const hand = heroHand(knight, 'idle')
      knight.fireballs.push({ x: hand.x + 6, y: hand.y - 4, vx: FIREBALL_SPEED, size: 1.5, isUltimate: false })
      return
    }

    if (random() < (foe.isBoss ? 0.7 : 0.6)) {
      foe.parry = 0.25
      burst(knight.sparks, at.x, at.y, 8, STEEL_SPARKS, random, 18)
      popWord(knight.pops, pickFrom(['CLANG!', 'TING!', 'CLASH!'], random), at.x)
      foe.x += 1
    } else {
      landOnFoe(knight, foe, random)

      if (knight.weapon === 'daggers') {
        burst(knight.sparks, foe.x + 2, at.y + 1, 6, HIT_SPARKS, random, 16)
      }
    }

    return
  }

  if (random() < 0.8) {
    knight.parry = 0.25
    burst(knight.sparks, at.x, at.y, 8, STEEL_SPARKS, random, 18)
    popWord(knight.pops, pickFrom(['PARRY!', 'CLANG!', 'TING!'], random), at.x)

    if (random() < 0.3) {
      quip(knight.chat, 'hero', pick(HERO_LINES.parry, random))
    }
  } else {
    knight.hurt = 0.3
    knight.x -= 2
    burst(knight.sparks, knight.x + BODY_WIDTH, at.y, 8, [0xffffff, 0xff7b72], random, 16)
    popWord(knight.pops, pickFrom(['OOF', 'TCH', 'NICK'], random), knight.x + BODY_WIDTH)

    if (random() < 0.4) {
      quip(knight.chat, 'hero', pick(HERO_LINES.hurt, random))
    }
  }
}

// Cuts the rival in two at its middle: top half flies, bottom half drops.
const split = (knight: Knight, foe: Foe, random: () => number) => {
  const rows = spriteOf(foe.rival, foeHeight(foe))
  const middle = Math.ceil(rows.length / 2)
  const top = GROUND - rows.length
  const colors = knight.isBurnt || knight.flameDuels > 0 ? FLAME : knight.ultimate === 'holy' ? GOLD_SPARKS : HIT_SPARKS

  knight.halves = [
    { rows: rows.slice(0, middle), rival: foe.rival, x: foe.x, top, vx: between(random, 10, 18), vy: -between(random, 8, 14), age: 0, isBurnt: knight.isBurnt },
    { rows: rows.slice(middle), rival: foe.rival, x: foe.x, top: top + middle, vx: between(random, 2, 6), vy: 0, age: 0, isBurnt: knight.isBurnt },
  ]
  burst(knight.sparks, foe.x + foeWidth(foe) / 2, top + middle, 16, colors, random, 24)
}

const stepFireballs = (knight: Knight, seconds: number, columns: number, random: () => number) => {
  const foe = knight.foe
  const dummy = knight.dummy
  const flying: Fireball[] = []

  for (const ball of knight.fireballs) {
    ball.x += ball.vx * seconds

    if (random() < 0.8) {
      knight.sparks.push({ x: ball.x - ball.size, y: ball.y + between(random, -ball.size, ball.size), vx: -between(random, 4, 10), vy: -between(random, 2, 6), age: 0, life: 0.35, color: pickFrom(FLAME, random), isSoft: false })
    }

    // With no rival, a practice fireball hits the dummy or leaves the field.
    if (foe === null || foe.isFleeing) {
      if (dummy !== null && ball.x >= dummy.x) {
        hitDummy(knight, dummy, random)
        burst(knight.sparks, dummy.x + 2, ball.y, 8, FLAME, random, 16)
      } else if (ball.x < columns + 4) {
        flying.push(ball)
      }
      continue
    }

    if (ball.x < foe.x) {
      flying.push(ball)
      continue
    }

    if (ball.isUltimate) {
      const center = foeCenter(foe)
      knight.rings.push({ x: center.x, y: center.y, age: 0 }, { x: center.x, y: center.y, age: 0.15 }, { x: center.x, y: center.y, age: 0.3 })
      burst(knight.sparks, center.x, center.y, 40, FLAME, random, 32)
      popWord(knight.pops, 'INFERNO!', center.x)
      foe.hp = 0
      knight.isBurnt = true
      enter(knight, 'freeze')
    } else if (random() < 0.35) {
      burst(knight.sparks, foe.x, ball.y, 8, STEEL_SPARKS, random, 16)
      popWord(knight.pops, 'BLOCKED', foe.x)
    } else {
      landOnFoe(knight, foe, random)
    }
  }

  knight.fireballs = flying
}

// The blade's tip, left behind as a trail while it strikes.
const traceTip = (knight: Knight, hand: { x: number; y: number }, angle: number, way: number, length: number) => {
  knight.trail.push({ x: hand.x + way * Math.cos(angle) * length, y: hand.y + Math.sin(angle) * length, age: 0 })
}

const hitDummy = (knight: Knight, dummy: Dummy, random: () => number) => {
  dummy.flash = 0.12
  dummy.wobble = 1.5
  burst(knight.sparks, dummy.x + 2, GROUND - 5, 8, STRAW, random, 16)
  popWord(knight.pops, pickFrom(['THWACK', 'WHUMP', 'PAF!'], random), dummy.x + 2)
}

// The rack holds the turn's weapon and two others, in no particular order.
const rackOf = (weapon: Weapon, random: () => number) => {
  const others = [...new Set(HERO_WEAPONS)].filter(other => other !== weapon)
  const weapons = [weapon, ...[0, 1].map(() => others.splice(Math.floor(random() * others.length), 1)[0]!)]

  return weapons.sort(() => random() - 0.5)
}

const takeFromRack = (knight: Knight, random: () => number) => {
  const rack = knight.rack

  if (rack === null || !rack.weapons.includes(knight.weapon)) {
    return
  }

  rack.weapons = rack.weapons.filter(weapon => weapon !== knight.weapon)
  knight.facing = 1
  popWord(knight.pops, `${WEAPONS[knight.weapon].name}!`, knight.x + BODY_WIDTH / 2)
  say(knight.chat, 'hero', HERO_LINES.weapon[knight.weapon], 1.2)
  burst(knight.sparks, knight.x + BODY_WIDTH, HERO_TOP + 2, 6, STEEL_SPARKS, random, 12)
}

// Pinch stops what it was practising and turns to the trouble.
const stopPractice = (knight: Knight, random: () => number) => {
  takeFromRack(knight, random)
  knight.isPracticing = false
  knight.swing = null
  knight.facing = 1
}

// The prelude: Pinch alone, busy, `knight.phaseSeconds` into the turn.
const practise = (knight: Knight, seconds: number, random: () => number) => {
  const t = knight.phaseSeconds
  const hand = heroHand(knight, 'idle')

  switch (knight.prelude) {
    case 'dummy': {
      const dummy = knight.dummy

      if (dummy === null) {
        break
      }

      if (knight.swing === null) {
        knight.untilSwing -= seconds

        if (knight.untilSwing <= 0) {
          const weapon = WEAPONS[knight.weapon]
          knight.swing = { by: 'hero', kind: random() < weapon.thrust ? 'thrust' : 'slash', seconds: 0, hasImpact: false }
        }
        break
      }

      const swing = knight.swing
      const pace = WEAPONS[knight.weapon].pace
      swing.seconds += seconds

      if (swing.seconds >= WINDUP * pace && swing.seconds <= (STRIKE + 0.05) * pace && knight.weapon !== 'staff') {
        traceTip(knight, heroHand(knight, swing.kind === 'thrust' ? 'punch' : 'idle'), swingAngle(swing, pace), 1, WEAPONS[knight.weapon].length)
      }

      if (!swing.hasImpact && swing.seconds >= IMPACT * pace) {
        swing.hasImpact = true

        if (knight.weapon === 'staff') {
          knight.fireballs.push({ x: hand.x + 6, y: hand.y - 4, vx: FIREBALL_SPEED, size: 1.5, isUltimate: false })
        } else {
          hitDummy(knight, dummy, random)
        }
      }

      if (swing.seconds >= SWING_SECONDS * pace) {
        knight.swing = null
        knight.untilSwing = between(random, 0.15, 0.35)
      }
      break
    }
    case 'whetstone': {
      // The blade's edge on the stone: a shower of sparks every stroke.
      if (Math.floor(t / 0.22) !== Math.floor((t - seconds) / 0.22)) {
        const tip = { x: hand.x + Math.cos(WHET_ANGLE) * WEAPONS[knight.weapon].length, y: hand.y + Math.sin(WHET_ANGLE) * WEAPONS[knight.weapon].length }
        burst(knight.sparks, tip.x, tip.y, 5, STEEL_SPARKS, random, 14)
      }

      if (t >= 0.3 && t - seconds < 0.3) {
        popWord(knight.pops, 'SHHK SHHK', hand.x + 4)
      }
      break
    }
    case 'rack': {
      // A look over the rack, then the pick.
      knight.facing = t < 0.5 ? -1 : 1

      if (t >= 0.5) {
        takeFromRack(knight, random)
      }
      break
    }
    case 'twirl': {
      if (t % TWIRL_EVERY < TWIRL_SECONDS && random() < 0.6) {
        traceTip(knight, hand, twirlAngle(t), 1, WEAPONS[knight.weapon].length)
      }

      if (t % TWIRL_EVERY >= TWIRL_SECONDS && (t - seconds) % TWIRL_EVERY < TWIRL_SECONDS) {
        popWord(knight.pops, pickFrom(['HYAH!', 'EN GARDE!', 'TA-DA'], random), hand.x)
      }
      break
    }
    case 'salute': {
      // Blade up before the face, a glint along it, then down to guard.
      if (t >= 0.35 && t - seconds < 0.35) {
        const length = WEAPONS[knight.weapon].length
        burst(knight.sparks, hand.x, hand.y - length, 8, GOLD_SPARKS, random, 10)
        popWord(knight.pops, 'SHING!', hand.x)
      }
      break
    }
  }
}

const WHET_ANGLE = 0.5
const TWIRL_SECONDS = 0.9
const TWIRL_EVERY = 1.6
const twirlAngle = (t: number) => (t % TWIRL_EVERY) * 14

// The incident: what breaks the calm, `knight.incidentSeconds` in.
const startIncident = (knight: Knight, columns: number, random: () => number) => {
  const incident = pickFresh(INCIDENTS, knight.lastIncident, random)
  knight.incident = incident
  knight.lastIncident = incident
  knight.incidentSeconds = 0

  switch (incident) {
    case 'scout':
      knight.scout = { rival: pickRival(random), x: columns, stride: 0, isLeaving: false }
      break
    case 'alarm':
      stopPractice(knight, random)
      popWord(knight.pops, '!', knight.x + BODY_WIDTH / 2)
      later(knight.chat, 'hero', pick(HERO_LINES.spotted, random), 0.5, 1.4)
      break
    case 'quick':
      stopPractice(knight, random)
      spawnFoe(knight, columns, random, true)
      enter(knight, 'enter')
      break
    case 'arrow': {
      // Lobbed from off the right edge to land just in front of Pinch, or in the dummy.
      const target = knight.dummy === null ? { x: knight.x + BODY_WIDTH + 4, y: GROUND - 1 } : { x: knight.dummy.x + 2, y: GROUND - 5 }
      const flight = 0.6
      const top = 3
      knight.arrow = {
        x: columns,
        y: top,
        vx: (target.x - columns) / flight,
        vy: (target.y - top - 0.5 * ARROW_GRAVITY * flight * flight) / flight,
        isStuck: false,
      }
      break
    }
  }
}

const ARROW_GRAVITY = 40

const stepIncident = (knight: Knight, seconds: number, columns: number, random: () => number) => {
  knight.incidentSeconds += seconds
  const t = knight.incidentSeconds

  if (knight.incident === 'scout' && t >= 0.45 && t - seconds < 0.45 && knight.scout !== null) {
    say(knight.chat, 'foe', pick(RIVAL_LINES.scout, random), 1.2)
  }

  if (knight.incident === 'scout' && t >= 0.7 && t - seconds < 0.7) {
    stopPractice(knight, random)
    popWord(knight.pops, '!', knight.x + BODY_WIDTH / 2)
    later(knight.chat, 'hero', pick(HERO_LINES.spotted, random), 0.4, 1.3)
  }

  if (knight.incident === 'scout' && t >= 1.3 && knight.scout !== null) {
    knight.scout.isLeaving = true
  }

  // Footsteps off the right edge, coming closer.
  if (knight.incident === 'alarm' && knight.phase === 'calm' && Math.floor(t / 0.5) !== Math.floor((t - seconds) / 0.5)) {
    const x = columns - 3 - t * 12
    burst(knight.sparks, x, GROUND - 1, 4, DUST, random, 8, true)
    popWord(knight.pops, 'thud', x)
  }
}

// Scouts and arrows keep moving whatever the act.
const stepVisitors = (knight: Knight, seconds: number, columns: number, random: () => number) => {
  const scout = knight.scout

  if (scout !== null) {
    scout.stride += seconds * 12
    scout.x = scout.isLeaving ? scout.x + FLEE_SPEED * seconds : Math.max(Math.round(columns * 0.72), scout.x - 50 * seconds)

    if (scout.x > columns + 2) {
      knight.scout = null
    }
  }

  const arrow = knight.arrow

  if (arrow !== null && !arrow.isStuck) {
    arrow.x += arrow.vx * seconds
    arrow.y += arrow.vy * seconds
    arrow.vy += ARROW_GRAVITY * seconds

    const dummy = knight.dummy
    const isInDummy = dummy !== null && arrow.x <= dummy.x + 2
    if (arrow.y >= GROUND - 1 || isInDummy) {
      arrow.isStuck = true
      arrow.y = Math.min(arrow.y, GROUND - 1)
      popWord(knight.pops, 'THUNK!', arrow.x)
      burst(knight.sparks, arrow.x, arrow.y, 5, isInDummy ? STRAW : DUST, random, 10, !isInDummy)

      if (dummy !== null && isInDummy) {
        dummy.wobble = 1.5
      }

      stopPractice(knight, random)
      later(knight.chat, 'hero', pick(HERO_LINES.spotted, random), 0.4, 1.4)
    }
  }

  const dummy = knight.dummy

  if (dummy !== null) {
    dummy.flash = Math.max(0, dummy.flash - seconds)
    dummy.wobble *= Math.max(0, 1 - seconds * 5)
  }

  const foe = knight.foe

  if (foe !== null && foe.isFleeing) {
    foe.x += FLEE_SPEED * seconds
    foe.stride += seconds * 14

    if (foe.x > columns + 2) {
      knight.foe = null
    }
  }
}

// Acts as they arrive: the incident, the fight, the set piece's boss.
const startAct = (knight: Knight, act: Act, columns: number, random: () => number) => {
  if (knight.isOutro) {
    return
  }

  if (act === 1 && knight.phase === 'calm' && knight.incident === null) {
    startIncident(knight, columns, random)
    return
  }

  if (act >= 2 && knight.phase === 'calm') {
    stopPractice(knight, random)
    knight.dummy = null
    enter(knight, 'enter')
    later(knight.chat, 'hero', pick(HERO_LINES.ready, random), 0.1, 1.3)
  }

  // The set piece: the next rival is a boss, and the current duel wraps up.
  if (act === 3) {
    knight.isBossDue = true

    if (knight.phase === 'duel' && knight.foe !== null && !knight.foe.isBoss) {
      knight.duelSeconds = Math.min(knight.duelSeconds, knight.phaseSeconds + 0.6)
    } else if (knight.phase === 'enter') {
      knight.duelSeconds = Math.min(knight.duelSeconds, 1.2)
    }
  }
}

// A new turn: the session's duels, KOs and flaming weapon carry over; the
// field is cleared and Pinch starts on its own with a prelude.
export const beginKnightTurn = (knight: Knight, columns: number, random: () => number = Math.random) => {
  const home = homeOf(columns)
  const prelude = pickFresh(PRELUDES, knight.lastPrelude, random)

  Object.assign(knight, {
    act: 0,
    lastAct: 0,
    home,
    x: home,
    facing: 1,
    stride: 0,
    foe: null,
    swing: null,
    untilSwing: 0.15,
    parry: 0,
    hurt: 0,
    ultimate: null,
    isBurnt: false,
    fireballs: [],
    trail: [],
    halves: [],
    sparks: [],
    pops: [],
    rings: [],
    chat: createTalk(),
    prelude,
    lastPrelude: prelude,
    isPracticing: true,
    isWeaponPicked: true,
    incident: null,
    scout: null,
    arrow: null,
    isOutro: false,
  })
  knight.weapon = prelude === 'whetstone' ? pickFrom(BLADES, random) : pickFrom(HERO_WEAPONS, random)
  knight.dummy = prelude === 'dummy' ? { x: home + BODY_WIDTH + 6, flash: 0, wobble: 0 } : null
  knight.rack = prelude === 'rack' ? { x: Math.max(1, home - 11), weapons: rackOf(knight.weapon, random) } : null
  enter(knight, 'calm')
}

// The turn is over: a rival mid-duel gets the finishing cut, one still on its
// way (or a boss) runs for it, and Pinch signs off.
export const endKnightTurn = (knight: Knight, columns: number, random: () => number = Math.random) => {
  const foe = knight.foe

  knight.isOutro = true
  knight.incident = null
  stopPractice(knight, random)

  if (knight.scout !== null) {
    knight.scout.isLeaving = true
  }

  if (foe !== null && !foe.isFleeing && ['enter', 'duel', 'powerup', 'ultimate'].includes(knight.phase)) {
    if (foe.isBoss || knight.phase === 'enter') {
      flee(knight, foe, random)
    } else {
      knight.fireballs = []
      knight.dashFrom = knight.x
      enter(knight, 'finisher')
      later(knight.chat, 'hero', pick(HERO_LINES.outro, random), 0.75, 1.4)
      return
    }
  }

  say(knight.chat, 'hero', pick(HERO_LINES.outro, random), 1.4)
}

export const stepKnight = (knight: Knight, seconds: number, columns: number, random: () => number = Math.random) => {
  const home = homeOf(columns)

  knight.home = home
  knight.seconds += seconds
  knight.hurt = Math.max(0, knight.hurt - seconds)
  knight.parry = Math.max(0, knight.parry - seconds)

  if (knight.act !== knight.lastAct) {
    knight.lastAct = knight.act
    startAct(knight, knight.act, columns, random)
  }

  stepVisitors(knight, seconds, columns, random)

  if (knight.incident !== null) {
    stepIncident(knight, seconds, columns, random)
  }

  // Stillness: the blow has landed and nothing moves yet.
  if (knight.phase === 'freeze') {
    knight.phaseSeconds += seconds

    if (knight.phaseSeconds >= FREEZE_SECONDS && knight.foe !== null) {
      const foe = knight.foe
      split(knight, foe, random)
      popWord(knight.pops, foe.isBoss ? 'BOSS SLAIN!' : pickFrom(['ONE CUT.', 'FINISHED.', 'SLICED!'], random), knight.x + BODY_WIDTH)

      if (foe.isBoss) {
        knight.flameDuels = FLAME_DUELS
        later(knight.chat, 'hero', pick(HERO_LINES.bossDown, random), 0.4, 1.6)
      } else if (knight.flameDuels > 0) {
        knight.flameDuels -= 1
      }

      knight.kos += 1
      knight.foe = null
      enter(knight, 'split')
    }

    knight.sparks = stepSparks(knight.sparks, seconds)
    knight.rings = stepRings(knight.rings, seconds)
    stepTalk(knight.chat, seconds)
    return
  }

  knight.phaseSeconds += seconds
  const foe = knight.foe

  if (foe !== null) {
    foe.flash = Math.max(0, foe.flash - seconds)
    foe.parry = Math.max(0, foe.parry - seconds)
  }

  switch (knight.phase) {
    case 'calm': {
      if (knight.isPracticing) {
        practise(knight, seconds, random)
      }
      break
    }
    case 'enter': {
      if (knight.x < home) {
        knight.x = Math.min(home, knight.x + WALK_SPEED * 2 * seconds)
        knight.stride += seconds * 10
      }

      if (foe === null) {
        if (knight.isOutro) {
          enter(knight, 'calm')
        } else {
          spawnFoe(knight, columns, random)
        }
        break
      }

      if (foe.lift > 0) {
        foe.vy += DROP_GRAVITY * seconds
        foe.lift = Math.max(0, foe.lift - foe.vy * seconds)

        if (foe.lift === 0) {
          land(knight, foe, random)
        }
      } else {
        const isRunning = foe.entry === 'run'
        foe.x = Math.max(standX(knight), foe.x - (isRunning ? RUN_SPEED : WALK_SPEED) * seconds)
        foe.stride += seconds * (isRunning ? 14 : 8)
      }

      if (foe.x === standX(knight) && knight.x === home && foe.lift === 0) {
        knight.untilSwing = 0.5
        knight.ultimate = null
        enter(knight, 'duel')
        popWord(knight.pops, `${WEAPONS[knight.weapon].name}!`, home + BODY_WIDTH / 2)

        // The rival opens its mouth; Pinch answers with its weapon.
        const opener = foe.isBoss
          ? named(pick(BOSS_LINES.intro, random), rivalAt(foe.rival).label)
          : random() < 0.5
            ? pick(RIVAL_LINES.duel, random)
            : tauntFor(rivalAt(foe.rival).id, random)
        say(knight.chat, 'foe', opener, 1.4)
        later(knight.chat, 'hero', foe.isBoss ? pick(HERO_LINES.reply, random) : HERO_LINES.weapon[knight.weapon], 1.2, 1.4)
      }
      break
    }
    case 'duel': {
      if (foe === null) {
        enter(knight, 'walkback')
        break
      }

      // Drift back into stance between exchanges.
      knight.x += (home - knight.x) * Math.min(1, seconds * 3)
      foe.x += (standX(knight) - foe.x) * Math.min(1, seconds * 3)

      if (knight.swing === null) {
        knight.untilSwing -= seconds

        if (knight.untilSwing <= 0) {
          startSwing(knight, random)
        }
      } else {
        const swing = knight.swing
        const pace = paceOf(knight, swing)
        swing.seconds += seconds

        if (swing.seconds >= WINDUP * pace && swing.seconds <= (STRIKE + 0.05) * pace && !(swing.by === 'hero' && knight.weapon === 'staff')) {
          const hand = swing.by === 'hero' ? heroHand(knight, swing.kind === 'thrust' ? 'punch' : 'idle') : foeHand(foe)
          const angle = swingAngle(swing, pace)
          const way = swing.by === 'hero' ? 1 : -1
          const length = WEAPONS[swing.by === 'hero' ? knight.weapon : foe.weapon].length
          knight.trail.push({ x: hand.x + way * Math.cos(angle) * length, y: hand.y + Math.sin(angle) * length, age: 0 })
        }

        if (!swing.hasImpact && swing.seconds >= IMPACT * pace) {
          swing.hasImpact = true
          impact(knight, foe, swing, random)
        }

        if (swing.seconds >= SWING_SECONDS * pace) {
          knight.swing = null
          knight.untilSwing = between(random, 0.25, 0.55)
        }
      }

      // A boss gets a short exchange, then Pinch powers up and ends it.
      if (foe.isBoss && knight.phaseSeconds >= BOSS_POWERUP_AT && knight.swing === null) {
        knight.ultimate = pickFrom(ULTIMATES, random)
        burst(knight.sparks, knight.x + BODY_WIDTH / 2, HERO_TOP + 4, 24, GOLD_SPARKS, random, 24)
        popWord(knight.pops, 'POWER UP!', knight.x + BODY_WIDTH / 2)
        say(knight.chat, 'hero', pick(HERO_LINES.powerUp, random), 1.4)
        enter(knight, 'powerup')
        break
      }

      const isOver = foe.hp <= 0 || (!foe.isBoss && knight.phaseSeconds >= knight.duelSeconds)
      if (isOver && knight.swing === null && knight.fireballs.length === 0) {
        knight.dashFrom = knight.x
        enter(knight, 'finisher')
      }
      break
    }
    case 'powerup': {
      if (random() < 0.9) {
        knight.sparks.push({ x: knight.x + between(random, 0, BODY_WIDTH), y: GROUND - 1, vx: 0, vy: -between(random, 14, 24), age: 0, life: 0.5, color: pickFrom(GOLD_SPARKS, random), isSoft: false })
      }

      if (knight.phaseSeconds >= POWERUP_SECONDS) {
        popWord(knight.pops, knight.ultimate === 'inferno' ? 'INFERNO...' : 'HOLY BLADE!', knight.x + BODY_WIDTH)
        say(knight.chat, 'hero', HERO_LINES.ultimate[knight.ultimate ?? 'holy'], 1.6)
        say(knight.chat, 'foe', pick(BOSS_LINES.scared, random), 1.2)
        enter(knight, 'ultimate')
      }
      break
    }
    case 'ultimate': {
      if (foe === null) {
        enter(knight, 'walkback')
        break
      }

      if (knight.phaseSeconds >= CHARGE_SECONDS && knight.phaseSeconds - seconds < CHARGE_SECONDS) {
        if (knight.ultimate === 'inferno') {
          const hand = heroHand(knight, 'lift')
          knight.fireballs.push({ x: hand.x, y: hand.y - 3, vx: FIREBALL_SPEED * 1.2, size: 4, isUltimate: true })
        } else {
          knight.dashFrom = knight.x
          enter(knight, 'finisher')
        }
      }
      break
    }
    case 'finisher': {
      if (foe === null) {
        enter(knight, 'walkback')
        break
      }

      const to = Math.min(columns - BODY_WIDTH - 1, foe.x + foeWidth(foe) + 3)
      const progress = clamp(knight.phaseSeconds / DASH_SECONDS, 0, 1)
      knight.x = knight.dashFrom + (to - knight.dashFrom) * progress

      if (progress === 1) {
        foe.hp = 0
        say(knight.chat, 'hero', pick(HERO_LINES.finisher, random), 1.3)
        enter(knight, 'freeze')
      }
      break
    }
    case 'split': {
      if (knight.phaseSeconds >= SPLIT_SECONDS) {
        enter(knight, 'walkback')
      }
      break
    }
    case 'walkback': {
      knight.facing = -1
      knight.ultimate = null
      knight.x = Math.max(home, knight.x - WALK_SPEED * 2 * seconds)
      knight.stride += seconds * 10

      // Before the fight is on, or once the turn is over, Pinch waits.
      if (knight.x === home) {
        knight.facing = 1
        enter(knight, knight.act < 2 || knight.isOutro ? 'calm' : 'enter')
      }
      break
    }
  }

  stepFireballs(knight, seconds, columns, random)

  for (const point of knight.trail) {
    point.age += seconds
  }
  knight.trail = knight.trail.filter(point => point.age < 0.18)

  for (const half of knight.halves) {
    half.age += seconds
    half.x += half.vx * seconds
    half.top += half.vy * seconds
    half.vy += 40 * seconds
  }
  knight.halves = knight.halves.filter(half => half.age < SPLIT_SECONDS)

  // A flaming weapon sheds embers.
  if (knight.flameDuels > 0 && random() < 0.6) {
    const hand = heroHand(knight, 'idle')
    const reach = WEAPONS[knight.weapon].length * random()
    knight.sparks.push({ x: hand.x + Math.cos(GUARD_ANGLE) * reach, y: hand.y + Math.sin(GUARD_ANGLE) * reach, vx: between(random, -3, 3), vy: -between(random, 6, 12), age: 0, life: 0.4, color: pickFrom(FLAME, random), isSoft: false })
  }

  knight.sparks = stepSparks(knight.sparks, seconds)
  knight.pops = stepPops(knight.pops, seconds)
  knight.rings = stepRings(knight.rings, seconds)
  stepTalk(knight.chat, seconds)
}

// Where each line is said: over Pinch or over the rival.
const speechOf = (knight: Knight): Speech[] =>
  knight.chat.bubbles.flatMap(bubble => {
    if (bubble.who === 'hero') {
      return [{ text: bubble.text, x: knight.x + BODY_WIDTH / 2, color: HERO_VOICE }]
    }

    // The rival's lines come from the one fighting, or else the scout.
    const foe = knight.foe
    const scout = knight.scout

    if (foe !== null) {
      return [{ text: bubble.text, x: foeCenter(foe).x, color: foe.isBoss ? BOSS_VOICE : rivalVoice(foe.rival) }]
    }

    return scout === null ? [] : [{ text: bubble.text, x: scout.x + 3, color: rivalVoice(scout.rival) }]
  })

// Draws a weapon from the hand along `angle`: blades, hafts and heads.
const drawWeapon = (
  canvas: Canvas,
  hand: { x: number; y: number },
  angle: number,
  way: number,
  weapon: Weapon,
  look: Look,
  seconds: number,
  length = WEAPONS[weapon].length,
) => {
  const dx = way * Math.cos(angle)
  const dy = Math.sin(angle)
  const at = (along: number, across = 0) => ({ x: hand.x + dx * along - dy * across, y: hand.y + dy * along + dx * across })
  const dot = (along: number, across: number, color: number) => {
    const point = at(along, across)
    plot(canvas, point.x, point.y, color)
  }
  const glow = look === 'flame' ? FLAME : look === 'holy' ? HOLY : null
  const edge = (i: number, fallback: number) => (glow === null ? fallback : glow[Math.floor(((i - 1) / length) * glow.length)]!)

  if (weapon === 'sword' || weapon === 'daggers') {
    for (let i = 1; i <= length; i++) {
      dot(i, 0, edge(i, i === length ? STEEL.tip : STEEL.blade))
    }
    dot(1, 1, STEEL.hilt)
    dot(1, -1, STEEL.hilt)
    dot(0, 0, STEEL.hilt)
    return
  }

  for (let i = 0; i < length - 1; i++) {
    dot(i, 0, STEEL.haft)
  }

  if (weapon === 'axe') {
    for (let across = -1; across <= 2; across++) {
      dot(length - 1, across, edge(length, STEEL.head))
      dot(length, across, edge(length, across === 2 ? STEEL.tip : STEEL.head))
    }
  } else if (weapon === 'spear') {
    dot(length - 1, 0, edge(length - 1, STEEL.head))
    dot(length - 1, 1, STEEL.head)
    dot(length - 1, -1, STEEL.head)
    dot(length, 0, edge(length, STEEL.tip))
  } else if (weapon === 'hammer') {
    for (let along = length - 1; along <= length + 1; along++) {
      for (let across = -1; across <= 1; across++) {
        dot(along, across, edge(along, STEEL.head))
      }
    }
  } else {
    const flicker = Math.floor(seconds * 12) % 2
    dot(length - 1, 0, FLAME[flicker]!)
    dot(length, 0, FLAME[1 - flicker]!)
    dot(length, 1, FLAME[2]!)
    dot(length, -1, FLAME[2]!)
  }
}

const drawFireball = (canvas: Canvas, ball: Fireball) => {
  const reach = Math.ceil(ball.size)

  for (let dx = -reach; dx <= reach; dx++) {
    for (let dy = -reach; dy <= reach; dy++) {
      const distance = Math.hypot(dx, dy) / ball.size

      if (distance <= 1) {
        plot(canvas, ball.x + dx, ball.y + dy, FLAME[Math.min(FLAME.length - 1, Math.floor(distance * FLAME.length))]!)
      }
    }
  }
}

const heroPose = (knight: Knight): Pose => {
  if (knight.phase === 'finisher' || knight.phase === 'freeze') {
    return 'punch'
  }

  if (knight.phase === 'split' || knight.phase === 'powerup' || knight.phase === 'ultimate') {
    return 'lift'
  }

  if (knight.swing?.by === 'hero' && knight.swing.kind === 'thrust') {
    return 'punch'
  }

  const isWalking = knight.phase === 'walkback' || (knight.phase === 'enter' && knight.x < knight.home)
  return isWalking && Math.floor(knight.stride) % 2 === 1 ? 'stride' : 'idle'
}

// The weapon's angle: in the prelude, as the practice has it; else as the fight does.
const heroAngle = (knight: Knight) => {
  const t = knight.phaseSeconds

  if (knight.phase !== 'calm' || !knight.isPracticing) {
    return angleOf(knight, 'hero')
  }

  switch (knight.prelude) {
    case 'whetstone':
      return WHET_ANGLE
    case 'twirl':
      return t % TWIRL_EVERY < TWIRL_SECONDS ? twirlAngle(t) : GUARD_ANGLE
    case 'salute':
      return t < 1 ? -Math.PI / 2 : GUARD_ANGLE
    case 'rack':
      return t < 1.1 ? -1.5 : GUARD_ANGLE
    default:
      return angleOf(knight, 'hero')
  }
}

// The prelude's props, in pixels in every style.
const drawProps = (canvas: Canvas, knight: Knight) => {
  const rack = knight.rack

  if (rack !== null) {
    for (let y = GROUND - 7; y < GROUND; y++) {
      plot(canvas, rack.x, y, WOOD)
      plot(canvas, rack.x + 9, y, WOOD)
    }
    for (let x = rack.x; x <= rack.x + 9; x++) {
      plot(canvas, x, GROUND - 6, WOOD)
    }
    rack.weapons.forEach((weapon, slot) => {
      drawWeapon(canvas, { x: rack.x + 2 + slot * 3, y: GROUND - 1 }, -Math.PI / 2, 1, weapon, 'steel', knight.seconds, Math.min(7, WEAPONS[weapon].length))
    })
  }

  const dummy = knight.dummy

  if (dummy !== null) {
    DUMMY.forEach((line, y) => {
      // The top sways when hit; the post stays put.
      const sway = y < 5 ? Math.round(dummy.wobble * (5 - y) / 5) : 0
      ;[...line].forEach((pixel, x) => {
        const color = DUMMY_PALETTE[pixel]
        if (color !== undefined) {
          plot(canvas, dummy.x + x + sway, GROUND - DUMMY.length + y, dummy.flash > 0 ? 0xffffff : color)
        }
      })
    })
  }

  // The whetstone, under the blade's edge.
  if (knight.phase === 'calm' && knight.isPracticing && knight.prelude === 'whetstone') {
    const hand = heroHand(knight, 'idle')
    const tipX = Math.round(hand.x + Math.cos(WHET_ANGLE) * WEAPONS[knight.weapon].length)

    for (let x = tipX - 3; x <= tipX; x++) {
      plot(canvas, x, GROUND - 2, STONE.top)
      plot(canvas, x, GROUND - 1, STONE.side)
    }
  }

  const arrow = knight.arrow

  if (arrow !== null) {
    const speed = Math.hypot(arrow.vx, arrow.vy) || 1
    const way = { x: arrow.vx / speed, y: arrow.vy / speed }

    for (let i = 0; i <= 4; i++) {
      plot(canvas, arrow.x - way.x * i, arrow.y - way.y * i, i === 0 ? STEEL.tip : i === 4 ? 0xffffff : WOOD)
    }
  }
}

const lookOf = (knight: Knight): Look =>
  knight.ultimate === 'holy' && ['ultimate', 'finisher', 'freeze'].includes(knight.phase)
    ? 'holy'
    : knight.flameDuels > 0
      ? 'flame'
      : 'steel'

// The strip: everyone drawn in pixels, or with `withActors` false only the
// weapons and effects, for the -img style to place pictures over.
export const knightCells = (knight: Knight, columns: number, rows: number, withActors = true) => {
  const canvas = createCanvas(columns, rows)
  // In the -img style a rival with a picture is placed over the strip; one
  // without (a person's own design) is drawn here in pixels.
  const drawsRival = (rival: number) => withActors || !rivalAt(rival).hasPicture
  const foe = knight.foe
  const swing = knight.swing
  const scout = knight.scout

  drawProps(canvas, knight)

  // A scout faces Pinch on the way in, and away on the way out.
  if (scout !== null && drawsRival(scout.rival)) {
    const sprite = spriteOf(scout.rival)
    const rows = [...sprite, legsOf(sprite[0]?.length ?? 7, scout.stride)]
    drawFoe(canvas, scout.rival, scout.x, { rows: scout.isLeaving ? mirror(rows) : rows })
  }

  for (const half of knight.halves) {
    if (drawsRival(half.rival)) {
      const { palette } = rivalAt(half.rival)
      const fade = half.age / SPLIT_SECONDS
      const shaded = Object.fromEntries(
        Object.entries(palette).map(([key, color]) => [key, mix(half.isBurnt ? 0x2a2a2a : color, 0x3a3a3a, fade)]),
      )

      half.rows.forEach((line, y) => {
        ;[...line].forEach((pixel, x) => {
          const color = shaded[pixel]
          if (color !== undefined) {
            plot(canvas, half.x + x, half.top + y, color)
          }
        })
      })
    }
  }

  // The finishing cut, a streak along the dash: white, or gold for the holy blade.
  if (knight.phase === 'finisher' || knight.phase === 'freeze') {
    const fade = knight.phase === 'freeze' ? knight.phaseSeconds / FREEZE_SECONDS : 0
    const color = knight.ultimate === 'holy' ? 0xffe066 : 0xffffff

    for (let x = Math.round(knight.dashFrom + BODY_WIDTH); x <= knight.x + BODY_WIDTH; x++) {
      plot(canvas, x, HERO_TOP + 4, mix(color, TRAIL, fade))
      if ((x + Math.floor(knight.seconds * 30)) % 3 === 0) {
        plot(canvas, x, HERO_TOP + 3, mix(TRAIL, 0x3a3a3a, fade))
      }
    }
  }

  if (foe !== null) {
    // A boss hovers; a rival stands on legs, striding while it walks in.
    const lean = swing?.by === 'foe' ? -lunge(knight, swing) : 0
    const sprite = spriteOf(foe.rival, foeHeight(foe))
    const legs = foe.isBoss ? [] : [legsOf(sprite[0]?.length ?? 7, knight.phase === 'enter' || foe.isFleeing ? foe.stride : 0)]
    const rows = [...sprite, ...legs]

    if (drawsRival(foe.rival)) {
      drawFoe(canvas, foe.rival, foe.x + lean, { rows: foe.isFleeing ? mirror(rows) : rows, flash: foe.flash, lift: foe.lift })
    }

    if (!foe.isFleeing) {
      const hand = foeHand({ ...foe, x: foe.x + lean })
      drawWeapon(canvas, { x: hand.x, y: hand.y - Math.round(foe.lift) }, angleOf(knight, 'foe'), -1, foe.weapon, 'steel', knight.seconds)
    }
  }

  const pose = heroPose(knight)
  const lean = swing?.by === 'hero' ? lunge(knight, swing) : 0
  const heroX = Math.round(knight.x + lean)

  if (withActors) {
    drawHero(canvas, pose, knight.facing, heroX, GROUND, { flash: knight.hurt > 0.15 ? 1 : 0 })
  }

  // Pinch's weapon: raised in a power-up, grown for the holy blade.
  const hand = heroHand({ ...knight, x: heroX }, pose)
  const isFinishing = knight.phase === 'finisher' || knight.phase === 'freeze'
  const isRaised = knight.phase === 'split' || knight.phase === 'powerup' || knight.phase === 'ultimate'
  const angle = isFinishing ? 0 : isRaised ? -1.5 : heroAngle(knight)
  const holyGrowth = knight.phase === 'ultimate' && knight.ultimate === 'holy' ? clamp(knight.phaseSeconds / CHARGE_SECONDS, 0, 1) : 1
  const weapon = knight.ultimate === 'holy' && (knight.phase === 'ultimate' || isFinishing) ? 'sword' : knight.weapon
  const length = lookOf(knight) === 'holy' ? Math.round(WEAPONS.sword.length + (HOLY_LENGTH - WEAPONS.sword.length) * holyGrowth) : undefined
  // On the rack, the weapon is not in hand yet.
  const isArmed = !(knight.rack?.weapons.includes(knight.weapon) ?? false)

  if (isArmed) {
    drawWeapon(canvas, hand, angle, knight.facing, weapon, lookOf(knight), knight.seconds, length)
  }

  if (isArmed && knight.weapon === 'daggers' && weapon === 'daggers') {
    drawWeapon(canvas, { x: heroX, y: HERO_TOP + 4 }, 0.6, knight.facing, 'daggers', lookOf(knight), knight.seconds)
  }

  // The inferno gathers over Pinch's raised hand before it is thrown.
  if (knight.phase === 'ultimate' && knight.ultimate === 'inferno' && knight.phaseSeconds < CHARGE_SECONDS) {
    const top = heroHand({ ...knight, x: heroX }, 'lift')
    drawFireball(canvas, { x: top.x, y: top.y - 3, vx: 0, size: 1 + 3 * (knight.phaseSeconds / CHARGE_SECONDS), isUltimate: true })
  }

  for (const ball of knight.fireballs) {
    drawFireball(canvas, ball)
  }

  for (const point of knight.trail) {
    plot(canvas, point.x, point.y, mix(TRAIL, 0x3a3a3a, point.age / 0.18))
  }

  drawRings(canvas, knight.rings)
  drawSparks(canvas, knight.sparks)

  const left = [`DUEL ${knight.duels}`, `KO ${knight.kos}`, WEAPONS[knight.weapon].name, knight.flameDuels > 0 ? `FLAME x${knight.flameDuels}` : '']
    .filter(part => part !== '')
    .join('  ')
  const hud = { left, right: foe === null ? undefined : `${rivalAt(foe.rival).label} ${hpBar(foe.hp, foe.maxHp, Math.min(8, foe.maxHp))}` }

  return packCanvas(canvas, hudOverlays(hud, knight.pops, columns, speechOf(knight)))
}

// The -img style's pictures: Pinch, the rival (or its halves, as it falls).
export const knightActors = (knight: Knight): Actor[] => {
  const actors: Actor[] = []
  const foe = knight.foe
  const swing = knight.swing

  for (const half of knight.halves) {
    if (half.rows === knight.halves[0]?.rows && rivalAt(half.rival).hasPicture) {
      actors.push({ key: keyOf(half), file: rivalFile(half.rival, 'ko'), left: Math.round(half.x), top: cellTop(half.top), columns: rivalColumns(half.rival), rows: 4 })
    }
  }

  const scout = knight.scout

  if (scout !== null && rivalAt(scout.rival).hasPicture) {
    actors.push({ key: keyOf(scout), file: rivalFile(scout.rival, walkFrame(scout.stride), 0, scout.isLeaving), left: Math.round(scout.x), top: cellTop(GROUND - 8), columns: rivalColumns(scout.rival), rows: 4 })
  }

  if (foe !== null && rivalAt(foe.rival).hasPicture) {
    const lean = swing?.by === 'foe' ? -lunge(knight, swing) : 0
    const rows = foe.isBoss ? 5 : 4
    const isStriding = knight.phase === 'enter' || foe.isFleeing
    const frame = foe.flash > 0 ? 'hurt' : isStriding && Math.floor(foe.stride) % 2 === 1 ? 'walk-1' : 'walk-0'
    const top = cellTop(GROUND - rows * 2 - foe.lift)

    // One dropping in shows once it is inside the band.
    if (top >= 0) {
      actors.push({ key: keyOf(foe), file: rivalFile(foe.rival, frame, 0, foe.isFleeing), left: Math.round(foe.x + lean), top, columns: rivalColumns(foe.rival, rows), rows })
    }
  }

  const lean = swing?.by === 'hero' ? lunge(knight, swing) : 0
  actors.push({
    key: keyOf(knight),
    file: heroFile(heroPose(knight), knight.hurt > 0.15 ? 'flash' : 'plain', knight.facing),
    left: Math.round(knight.x + lean) - (knight.facing < 0 ? 4 : 0),
    top: cellTop(HERO_TOP),
    columns: 16,
    rows: 4,
  })

  return actors
}
