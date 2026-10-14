// dojo: Clawd runs into the middle of the dojo and takes on every rival
// that comes at it from either side: karate chops, flying kicks, uppercuts,
// judo throws, and a spinning kick when they come at once. Waves escalate,
// powerups drop (rage, giant), and every third wave a boss steps in.
//
// A turn plays as acts (see acts.ts): Clawd trains alone (a kata, boards or
// bricks to break, a sandbag, shadowboxing), something happens (a scout, an
// ambush, a rival barging in or dropping through the roof), the fight is on,
// then a set piece (a boss, a rush, a powerup) before the full loop.

import type { Act } from './acts'
import { pickFresh } from './acts'
import type { Actor } from './actors'
import { cellTop, heroFile, keyOf, rivalColumns, rivalFile, walkFrame } from './actors'
import type { Drop, Pop, Ring, Speech, Spark, Waves } from './arena'
import {
  BOSS_HEIGHT,
  BOSS_VOICE,
  HERO_VOICE,
  GROUND,
  HIT_SPARKS,
  STEEL_SPARKS,
  between,
  bossHp,
  burst,
  countBossDown,
  countKo,
  createWaves,
  drawDrops,
  drawFoe,
  drawRings,
  drawSparks,
  drawStars,
  dropFrom,
  foeSpeed,
  hpBar,
  hudOverlays,
  topRowSpans,
  pickFrom,
  popWord,
  rivalVoice,
  scoreLine,
  spawnSeconds,
  spriteOf,
  stepDrops,
  stepPops,
  stepRings,
  stepSparks,
  stepWaves,
} from './arena'
import { BOSS_LINES, HERO_LINES, RIVAL_LINES, bossTalk, pick, tauntFor } from './banter'
import type { Pose } from './hero'
import { BODY_WIDTH, POSE_ROWS, drawHero } from './hero'
import { clamp, createCanvas, packCanvas, plot } from './raster'
import { pickRival, rivalAt, widthOf } from './rivals'
import type { Talk } from './talk'
import { createTalk, later, quip, say, stepTalk } from './talk'

type Prelude = 'kata' | 'boards' | 'bricks' | 'sandbag' | 'shadowbox'
type Incident = 'scout' | 'ambush' | 'barge' | 'roof'
type SetPiece = 'boss' | 'rush' | 'power'

const PRELUDES: readonly Prelude[] = ['kata', 'boards', 'bricks', 'sandbag', 'shadowbox']
const INCIDENTS: readonly Incident[] = ['scout', 'ambush', 'barge', 'roof']
const SET_PIECES: readonly SetPiece[] = ['boss', 'rush', 'power']

type Move = 'chop' | 'kick' | 'throw' | 'uppercut' | 'spin'
type Power = 'rage' | 'giant'

const MOVES: Record<Move, { seconds: number; hitAt: number; pose: Pose; words: readonly string[] }> = {
  chop: { seconds: 0.3, hitAt: 0.12, pose: 'punch', words: ['POW!', 'WHAM!', 'CHOP!'] },
  kick: { seconds: 0.45, hitAt: 0.2, pose: 'kick', words: ['HIYAA!', 'BAM!', 'KAPOW!'] },
  throw: { seconds: 0.6, hitAt: 0.5, pose: 'lift', words: ['IPPON!', 'SLAM!', 'YOINK!'] },
  uppercut: { seconds: 0.35, hitAt: 0.12, pose: 'lift', words: ['UPPERCUT!', 'SHORYU!', 'BYE!'] },
  spin: { seconds: 0.5, hitAt: 0.22, pose: 'kick', words: ['WHIRLWIND!', 'SPIN!', 'TORNADO!'] },
}
const SINGLE_MOVES: readonly Move[] = ['chop', 'kick', 'throw', 'uppercut']
const BOSS_MOVES: readonly Move[] = ['chop', 'kick', 'uppercut']

const POWERS: readonly Power[] = ['rage', 'giant']
const POWER_NAMES: Record<Power, string> = { rage: 'RAGE', giant: 'GIANT' }
const POWER_COLORS: Record<Power, number> = { rage: 0xff4d2e, giant: 0x7fd4ff }
const POWER_SECONDS = 7
const DROP_CHANCE = 0.12
const GIANT_HEIGHT = GROUND
const STOMP_SECONDS = 0.9
const STOMP_REACH = 16

const RUN_IN_SPEED = 40 // pixels a second
const KICK_HOP = 2
const THROW_RISE = 4
const KO_SECONDS = 1.3
const BOSS_KO_SECONDS = 1.6
const GRAVITY = 40
const BOSS_ATTACK_SECONDS = 1.3
const LUNGE_SECONDS = 0.3
const LUNGE_IMPACT = 0.15

// Before the full loop, rivals sprint in (arriving within these seconds) or
// drop in through the roof, so a short turn still gets its fight.
const ARRIVE_SECONDS = [1.1, 1.8] as const
const DROP_IN_CHANCE = 0.25
const DROP_HEIGHT = 12
const DAZED_SECONDS = 0.35
const SCOUT_SPEED = 26
const FLEE_SPEED = 50
const BOSS_WALK = 14
const BOSS_HURRY = 28

// Training: a stack is chopped every STACK_CYCLE seconds, the sandbag kicked
// every BAG_CYCLE, a kata changes stance every KATA_BEAT.
const STACK_CYCLE = 1.5
const STACK_BREAK_AT = 0.6
const BAG_CYCLE = 0.5
const BAG_HIT_AT = 0.2
const KATA_BEAT = 0.22
const KATA: readonly { pose: Pose; facing: 1 | -1 }[] = [
  { pose: 'punch', facing: 1 },
  { pose: 'kick', facing: 1 },
  { pose: 'punch', facing: -1 },
  { pose: 'kick', facing: -1 },
  { pose: 'lift', facing: 1 },
  { pose: 'idle', facing: 1 },
]

const BOARD = 0xc8955a
const BOARD_DARK = 0xa87a45
const BOARD_EDGE = 0x8b5a2b
const BRICK = 0xb5523b
const MORTAR = 0x9a9a9a
const STAND = 0x6b4a2b
const BAG = 0xb03a2e
const BAG_BAND = 0xe0d0b0
const ROPE = 0x9a9a9a
const DUST = [0x8a8a8a, 0xb0b0b0]

type Foe = {
  rival: number
  // +1 came from the right (runs left), -1 from the left.
  side: 1 | -1
  x: number
  speed: number
  stride: number
  // A scout peeks in and leaves; a rival flees when the turn ends.
  state: 'run' | 'held' | 'ko' | 'scout' | 'flee'
  ko: number
  lift: number
  vx: number
  vy: number
  // Seconds left standing still: dazed from a drop, or a scout looking around.
  wait: number
}

type Boss = {
  rival: number
  side: 1 | -1
  x: number
  hp: number
  maxHp: number
  flash: number
  untilAttack: number
  lunge: number | null
  ko: number | null
  lift: number
  vx: number
  vy: number
  hasSpoken: boolean
  // While above zero the boss is mid-speech, and Clawd lets it finish.
  hush: number
  // The turn ended before it went down: it backs off, to come back later.
  isLeaving: boolean
}

// Clawd's training before anything turns up.
type Drill = { kind: Prelude; seconds: number; isBroken: boolean; swing: number; swingSpeed: number }

// Something set to happen a little later in an incident or a set piece.
type Cue = { delay: number; run: () => void }

type Speaker = 'hero' | 'boss' | Foe

export type Dojo = {
  waves: Waves
  x: number
  push: number
  facing: 1 | -1
  stride: number
  isHome: boolean
  move: Move | null
  moveSeconds: number
  hasHit: boolean
  targets: Foe[]
  isBossTarget: boolean
  foes: Foe[]
  boss: Boss | null
  sparks: Spark[]
  pops: Pop[]
  rings: Ring[]
  drops: Drop<Power>[]
  power: { kind: Power; seconds: number } | null
  untilSpawn: number
  untilStomp: number
  hurt: number
  chat: Talk<Speaker>
  seconds: number
  // The act the turn is in, set by the band; `staged` is the last act whose
  // opening has played.
  act: Act
  staged: Act
  drill: Drill | null
  cues: Cue[]
  // The next single rival gets this move (an incident's throw or uppercut).
  nextMove: Move | null
  // Seconds left looking around, turning side to side.
  look: number
  // A boss earned before act 3 waits for it, across turns if need be.
  isBossPending: boolean
  isOutro: boolean
  lastPrelude: Prelude | undefined
  lastIncident: Incident | undefined
  lastSetPiece: SetPiece | undefined
}

export const createDojo = (): Dojo => ({
  waves: createWaves(),
  x: -BODY_WIDTH - 2,
  push: 0,
  facing: 1,
  stride: 0,
  isHome: false,
  move: null,
  moveSeconds: 0,
  hasHit: false,
  targets: [],
  isBossTarget: false,
  foes: [],
  boss: null,
  sparks: [],
  pops: [],
  rings: [],
  drops: [],
  power: null,
  untilSpawn: 0.8,
  untilStomp: STOMP_SECONDS,
  hurt: 0,
  chat: createTalk(),
  seconds: 0,
  act: 4,
  staged: 4,
  drill: null,
  cues: [],
  nextMove: null,
  look: 0,
  isBossPending: false,
  isOutro: false,
  lastPrelude: undefined,
  lastIncident: undefined,
  lastSetPiece: undefined,
})

const homeOf = (columns: number) => Math.round(columns / 2 - BODY_WIDTH / 2)
const isGiant = (dojo: Dojo) => dojo.power?.kind === 'giant'
const isRaging = (dojo: Dojo) => dojo.power?.kind === 'rage'
const bodyWidth = (dojo: Dojo) => (isGiant(dojo) ? Math.round((BODY_WIDTH * GIANT_HEIGHT) / POSE_ROWS) : BODY_WIDTH)
const bossWidth = (boss: Boss) => spriteOf(boss.rival, BOSS_HEIGHT)[0]?.length ?? 10

// Where a rival stops, toe to toe with Clawd.
const contactX = (dojo: Dojo, side: 1 | -1, width: number) =>
  side > 0 ? dojo.x + bodyWidth(dojo) + 1 : dojo.x - 1 - width

const foeContact = (dojo: Dojo, foe: Foe) => contactX(dojo, foe.side, widthOf(rivalAt(foe.rival)))

const heroEdge = (dojo: Dojo, side: 1 | -1) => (side > 0 ? dojo.x + bodyWidth(dojo) + 1 : dojo.x - 1)

// Where a held rival is during a throw: over Clawd's head, front to back.
const heldAt = (dojo: Dojo, foe: Foe) => {
  const width = widthOf(rivalAt(foe.rival))
  const progress = clamp(dojo.moveSeconds / MOVES.throw.hitAt, 0, 1)
  const angle = Math.PI * progress
  const radius = bodyWidth(dojo) / 2 + width / 2 + 1
  const center = dojo.x + bodyWidth(dojo) / 2 + foe.side * radius * Math.cos(angle)

  return { x: center - width / 2, lift: THROW_RISE * Math.sin(angle), isFlipped: angle > Math.PI / 2 }
}

const spawnBoss = (dojo: Dojo, columns: number, random: () => number) => {
  const side = random() < 0.5 ? 1 : -1
  const rival = pickRival(random)
  const hp = bossHp(dojo.waves)
  const width = spriteOf(rival, BOSS_HEIGHT)[0]?.length ?? 10

  dojo.boss = {
    rival,
    side,
    x: side > 0 ? columns : -width,
    hp,
    maxHp: hp,
    flash: 0,
    untilAttack: BOSS_ATTACK_SECONDS,
    lunge: null,
    ko: null,
    lift: 0,
    vx: 0,
    vy: 0,
    hasSpoken: false,
    hush: 0,
    isLeaving: false,
  }
  popWord(dojo.pops, 'BOSS!', columns / 2)
}

type Entry = { side?: 1 | -1; rival?: number; x?: number; lift?: number; state?: Foe['state']; arriveIn?: number }

// A rival from one side: from the edge unless `x` says otherwise. With
// `arriveIn` it sprints to Clawd in about that many seconds.
const spawnFoe = (dojo: Dojo, columns: number, random: () => number, entry: Entry = {}) => {
  const side = entry.side ?? (random() < 0.5 ? 1 : -1)
  const rival = entry.rival ?? pickRival(random)
  const foe: Foe = {
    rival,
    side,
    x: entry.x ?? (side > 0 ? columns : -widthOf(rivalAt(rival))),
    speed: foeSpeed(dojo.waves, random),
    stride: 0,
    state: entry.state ?? 'run',
    ko: 0,
    lift: entry.lift ?? 0,
    vx: 0,
    vy: 0,
    wait: 0,
  }

  if (entry.arriveIn !== undefined) {
    foe.speed = Math.max(foe.speed, Math.abs(foe.x - foeContact(dojo, foe)) / entry.arriveIn)
  }

  dojo.foes.push(foe)

  return foe
}

// A rival that drops through the roof a little way out from Clawd.
const dropIn = (dojo: Dojo, columns: number, random: () => number, side: 1 | -1, gap: number) => {
  const foe = spawnFoe(dojo, columns, random, { side, lift: DROP_HEIGHT })
  foe.x = foeContact(dojo, foe) + side * gap

  return foe
}

const launch = (dojo: Dojo, foe: Foe, move: Move, columns: number, random: () => number) => {
  const power = (isRaging(dojo) ? 1.8 : 1) * (move === 'kick' || move === 'spin' ? 1.5 : 1)

  foe.state = 'ko'
  foe.ko = 0

  if (move === 'throw') {
    foe.x = heldAt(dojo, foe).x
    foe.lift = 0
    foe.vx = -foe.side * between(random, 16, 26)
    foe.vy = -between(random, 4, 8)
  } else if (move === 'uppercut') {
    foe.vx = foe.side * between(random, 2, 6)
    foe.vy = -between(random, 26, 32)
  } else {
    foe.vx = foe.side * between(random, 22, 32) * power
    foe.vy = -between(random, 9, 13) * power
  }

  const at = move === 'throw' ? foe.x + widthOf(rivalAt(foe.rival)) / 2 : heroEdge(dojo, foe.side)
  burst(dojo.sparks, at, GROUND - POSE_ROWS / 2, 9, HIT_SPARKS, random, 20)

  if (isRaging(dojo)) {
    dojo.rings.push({ x: at, y: GROUND - 4, age: 0.1 })
  }

  if (random() < DROP_CHANCE) {
    dropFrom(dojo.drops, pickFrom(POWERS, random), at, GROUND - 6, random)
  }

  if (dojo.waves.combo > 0 && dojo.waves.combo % 5 === 0) {
    say(dojo.chat, 'hero', pick(HERO_LINES.streak, random))
  }

  if (countKo(dojo.waves)) {
    if (dojo.act >= 3 && !dojo.isOutro) {
      spawnBoss(dojo, columns, random)
    } else {
      dojo.isBossPending = true
    }
  }
}

const hitBoss = (dojo: Dojo, boss: Boss, random: () => number) => {
  const at = heroEdge(dojo, boss.side)

  boss.hp -= isRaging(dojo) || isGiant(dojo) ? 2 : 1
  boss.flash = 0.1
  boss.x += boss.side * 2
  burst(dojo.sparks, at, GROUND - 5, 10, HIT_SPARKS, random, 22)
  popWord(dojo.pops, pickFrom(['POW!', 'BAM!', 'CRACK!'], random), at + boss.side * 5)

  if (boss.hp <= 0) {
    boss.ko = 0
    boss.vx = boss.side * 30
    boss.vy = -16
    dojo.rings.push({ x: at, y: GROUND / 2, age: 0 })
    burst(dojo.sparks, at, GROUND / 2, 30, HIT_SPARKS, random, 30)
    popWord(dojo.pops, 'K.O.!', at)
    say(dojo.chat, 'boss', pick(BOSS_LINES.down, random), 1.4)
    later(dojo.chat, 'hero', pick(HERO_LINES.bossDown, random), 0.5, 1.8)
    dropFrom(dojo.drops, pickFrom(POWERS, random), at, GROUND / 2, random)
    countBossDown(dojo.waves)
  }
}

const stepBoss = (dojo: Dojo, boss: Boss, seconds: number, columns: number, random: () => number) => {
  boss.flash = Math.max(0, boss.flash - seconds)
  boss.hush = Math.max(0, boss.hush - seconds)

  if (boss.isLeaving && boss.ko === null) {
    boss.x += boss.side * FLEE_SPEED * seconds
    boss.lunge = null
    boss.lift = 0

    if (boss.x > columns + 2 || boss.x < -bossWidth(boss) - 2) {
      dojo.boss = null
    }

    return
  }

  if (boss.ko !== null) {
    boss.ko += seconds
    boss.x += boss.vx * seconds
    boss.lift -= boss.vy * seconds
    boss.vy += GRAVITY * seconds

    if (boss.ko > BOSS_KO_SECONDS) {
      dojo.boss = null
    }

    return
  }

  const stop = contactX(dojo, boss.side, bossWidth(boss))
  const walk = (dojo.act < 4 ? BOSS_HURRY : BOSS_WALK) * seconds
  boss.x = boss.side > 0 ? Math.max(stop, boss.x - walk) : Math.min(stop, boss.x + walk)
  boss.untilAttack -= seconds

  // Toe to toe for the first time: the boss introduces itself; Clawd roasts it.
  if (!boss.hasSpoken && Math.abs(boss.x - stop) < 1) {
    boss.hasSpoken = true
    boss.untilAttack = 3.6
    boss.hush = 3.2
    const talk = bossTalk(rivalAt(boss.rival).label, random)
    say(dojo.chat, 'boss', talk.intro, 1.8)
    later(dojo.chat, 'boss', talk.brag, 1.8, 1.6)
    later(dojo.chat, 'hero', talk.reply, 3.4, 1.6)
  }

  if (boss.lunge === null && boss.untilAttack <= 0 && Math.abs(boss.x - stop) < 1) {
    boss.lunge = 0
  }

  if (boss.lunge === null) {
    return
  }

  boss.lunge += seconds
  boss.lift = 2 * Math.sin(Math.min(1, boss.lunge / LUNGE_SECONDS) * Math.PI)

  // The lunge lands: Clawd blocks it or takes it.
  if (boss.lunge >= LUNGE_IMPACT && boss.lunge - seconds < LUNGE_IMPACT) {
    const at = heroEdge(dojo, boss.side)
    dojo.facing = boss.side

    if (random() < 0.55) {
      burst(dojo.sparks, at, GROUND - 5, 8, STEEL_SPARKS, random, 16)
      popWord(dojo.pops, 'BLOCK', at + boss.side * 5)
    } else {
      dojo.hurt = 0.3
      dojo.push = -boss.side * 3
      burst(dojo.sparks, at, GROUND - 5, 10, [0xffffff, 0xff7b72], random, 18)
      popWord(dojo.pops, pickFrom(['OOF', 'UGH', 'OUCH'], random), at)

      if (random() < 0.4) {
        quip(dojo.chat, 'hero', pick(HERO_LINES.hurt, random))
      }
    }
  }

  if (boss.lunge >= LUNGE_SECONDS) {
    boss.lunge = null
    boss.lift = 0
    boss.untilAttack = between(random, 1, 1.6)
  }
}

const startMove = (dojo: Dojo, random: () => number) => {
  const ready = dojo.foes.filter(foe => foe.state === 'run' && Math.abs(foe.x - foeContact(dojo, foe)) < 2)
  const left = ready.find(foe => foe.side < 0)
  const right = ready.find(foe => foe.side > 0)
  const boss = dojo.boss
  const isBossReady =
    boss !== null &&
    boss.ko === null &&
    boss.lunge === null &&
    Math.abs(boss.x - contactX(dojo, boss.side, bossWidth(boss))) < 1.5

  if (left !== undefined && right !== undefined) {
    dojo.move = 'spin'
    dojo.targets = [left, right]
  } else if (ready[0] !== undefined) {
    dojo.move = dojo.nextMove ?? pickFrom(SINGLE_MOVES, random)
    dojo.nextMove = null
    dojo.targets = [ready[0]]
    dojo.facing = ready[0].side

    if (dojo.move === 'throw') {
      ready[0].state = 'held'

      if (random() < 0.5) {
        say(dojo.chat, ready[0], pick(RIVAL_LINES.thrown, random), 1)
      }
    }
  } else if (isBossReady && boss.hush === 0) {
    dojo.move = pickFrom(BOSS_MOVES, random)
    dojo.targets = []
    dojo.facing = boss.side
  }

  if (dojo.move !== null) {
    dojo.moveSeconds = 0
    dojo.hasHit = false
    dojo.isBossTarget = dojo.targets.length === 0
  }
}

const land = (dojo: Dojo, move: Move, columns: number, random: () => number) => {
  if (dojo.isBossTarget) {
    if (dojo.boss !== null && dojo.boss.ko === null) {
      hitBoss(dojo, dojo.boss, random)
    }

    return
  }

  const first = dojo.targets[0]
  for (const foe of dojo.targets) {
    launch(dojo, foe, move, columns, random)
  }

  if (first !== undefined) {
    const word =
      dojo.waves.combo >= 5 && random() < 0.4 ? `COMBO x${dojo.waves.combo}` : pickFrom(MOVES[move].words, random)
    popWord(dojo.pops, word, heroEdge(dojo, first.side) + first.side * 5)
  }
}

const stomp = (dojo: Dojo, columns: number, random: () => number) => {
  const center = dojo.x + bodyWidth(dojo) / 2
  dojo.rings.push({ x: center, y: GROUND - 1, age: 0 })
  burst(dojo.sparks, center, GROUND - 1, 8, [0x8a8a8a, 0xb0b0b0], random, 18, true)

  for (const foe of dojo.foes) {
    if (foe.state === 'run' && Math.abs(foe.x - center) < STOMP_REACH + bodyWidth(dojo) / 2) {
      launch(dojo, foe, 'kick', columns, random)
    }
  }

  popWord(dojo.pops, 'STOMP!', center)
}

// A rival lands from the roof: dust, a thud, and a moment seeing stars.
const touchDown = (dojo: Dojo, foe: Foe, random: () => number) => {
  const width = widthOf(rivalAt(foe.rival))
  foe.vy = 0
  foe.wait = DAZED_SECONDS
  burst(dojo.sparks, foe.x + width / 2, GROUND - 1, 6, DUST, random, 12, true)
  popWord(dojo.pops, 'THUD!', foe.x + width / 2)
}

// Where the training prop stands: just past Clawd's reach, to the right.
const propX = (dojo: Dojo) => Math.round(dojo.x) + 14

// Clawd's stance while training: the pose, the way it faces, and a hop.
const drillLook = (drill: Drill): { pose: Pose; facing: 1 | -1; lift: number } => {
  const t = drill.seconds

  switch (drill.kind) {
    case 'kata': {
      const beat = KATA[Math.floor(t / KATA_BEAT) % KATA.length]!
      return { ...beat, lift: beat.pose === 'kick' ? 1 : 0 }
    }
    case 'boards':
    case 'bricks': {
      const cycle = t % STACK_CYCLE
      const pose = cycle < 0.35 ? 'idle' : cycle < STACK_BREAK_AT - 0.05 ? 'lift' : cycle < 0.85 ? 'punch' : 'idle'
      return { pose, facing: 1, lift: 0 }
    }
    case 'sandbag': {
      const cycle = t % BAG_CYCLE
      const isKicking = cycle >= BAG_HIT_AT - 0.08 && cycle < BAG_HIT_AT + 0.12
      return { pose: isKicking ? 'kick' : 'idle', facing: 1, lift: isKicking ? 1 : 0 }
    }
    case 'shadowbox':
      return {
        pose: t % 0.3 < 0.12 ? 'punch' : 'idle',
        facing: Math.floor(t / 0.9) % 2 === 0 ? 1 : -1,
        lift: Math.round(Math.abs(Math.sin(t * 10))),
      }
  }
}

const stepDrill = (dojo: Dojo, drill: Drill, seconds: number, random: () => number) => {
  const before = drill.seconds
  drill.seconds += seconds
  // True when the drill passed `at` seconds into a `cycle`-second loop.
  const passed = (at: number, cycle: number) => Math.floor((drill.seconds - at) / cycle) > Math.floor((before - at) / cycle)

  if (dojo.move === null && dojo.look === 0) {
    dojo.facing = drillLook(drill).facing
  }

  switch (drill.kind) {
    case 'kata': {
      const beat = Math.floor(drill.seconds / KATA_BEAT)
      if (beat !== Math.floor(before / KATA_BEAT) && KATA[beat % KATA.length]!.pose === 'kick') {
        popWord(dojo.pops, pickFrom(['HUP!', 'HAH!', 'HIYA!'], random), dojo.x + BODY_WIDTH / 2)
      }
      break
    }
    case 'boards':
    case 'bricks':
      if (passed(0, STACK_CYCLE)) {
        drill.isBroken = false
      }

      if (passed(STACK_BREAK_AT, STACK_CYCLE)) {
        const colors = drill.kind === 'boards' ? [BOARD, BOARD_EDGE, 0xffe0b0] : [BRICK, MORTAR, 0xd07a5a]
        drill.isBroken = true
        burst(dojo.sparks, propX(dojo) + 3, GROUND - 4, 14, colors, random, 22)
        popWord(dojo.pops, drill.kind === 'boards' ? 'CRACK!' : 'SMASH!', propX(dojo) + 3)
      }
      break
    case 'sandbag':
      if (passed(BAG_HIT_AT, BAG_CYCLE)) {
        drill.swingSpeed += 9
        burst(dojo.sparks, propX(dojo) + 2, GROUND - 2, 3, DUST, random, 8, true)

        if (Math.floor(drill.seconds / BAG_CYCLE) % 2 === 0) {
          popWord(dojo.pops, 'THUD', propX(dojo) + 4)
        }
      }

      drill.swingSpeed += (-30 * drill.swing - 3 * drill.swingSpeed) * seconds
      drill.swing = clamp(drill.swing + drill.swingSpeed * seconds, -1, 3)
      break
    case 'shadowbox':
      break
  }
}

// Training stops when something happens: the prop goes in a puff of dust.
const stowDrill = (dojo: Dojo, random: () => number) => {
  const drill = dojo.drill
  dojo.drill = null

  if (drill !== null && drill.kind !== 'kata' && drill.kind !== 'shadowbox') {
    burst(dojo.sparks, propX(dojo) + 3, GROUND - 4, 10, DUST, random, 14, true)
  }
}

const drawDrill = (canvas: ReturnType<typeof createCanvas>, dojo: Dojo, drill: Drill) => {
  const left = propX(dojo)

  if (drill.kind === 'boards' || drill.kind === 'bricks') {
    for (const y of [GROUND - 2, GROUND - 1]) {
      plot(canvas, left, y, STAND)
      plot(canvas, left + 5, y, STAND)
    }

    if (!drill.isBroken) {
      for (let y = GROUND - 5; y <= GROUND - 3; y++) {
        for (let dx = 0; dx < 6; dx++) {
          const color =
            drill.kind === 'boards'
              ? dx === 0 || dx === 5 ? BOARD_EDGE : y % 2 === 0 ? BOARD : BOARD_DARK
              : (dx + (y % 2) * 2) % 3 === 0 ? MORTAR : BRICK
          plot(canvas, left + dx, y, color)
        }
      }
    }
  }

  if (drill.kind === 'sandbag') {
    const swing = Math.round(drill.swing)
    const anchor = left + 2

    for (let y = 0; y < 3; y++) {
      plot(canvas, anchor + 1 + Math.round((swing * y) / 6), y, ROPE)
    }

    for (let y = 3; y < GROUND - 1; y++) {
      for (let dx = 0; dx < 4; dx++) {
        plot(canvas, anchor + swing + dx, y, y === 5 ? BAG_BAND : BAG)
      }
    }
  }
}

// What happens: a scout who thinks better of it, an ambush from both sides,
// a rival barging in to be thrown, or one dropping through the roof.
const startIncident = (dojo: Dojo, columns: number, random: () => number) => {
  const incident = pickFresh(INCIDENTS, dojo.lastIncident, random)
  const side = random() < 0.5 ? 1 : -1
  const center = dojo.x + BODY_WIDTH / 2
  dojo.lastIncident = incident
  dojo.facing = side

  switch (incident) {
    case 'scout': {
      const scout = spawnFoe(dojo, columns, random, { side, state: 'scout' })
      scout.wait = 1.1
      later(dojo.chat, 'hero', pick(HERO_LINES.spotted, random), 0.3, 1.1)
      later(dojo.chat, scout, pick(RIVAL_LINES.scout, random), 0.9, 1.3)
      break
    }
    case 'ambush':
      popWord(dojo.pops, '!', center)
      dojo.look = 0.9
      say(dojo.chat, 'hero', pick(HERO_LINES.spotted, random), 1.2)
      dojo.cues.push({
        delay: 0.8,
        run: () => {
          spawnFoe(dojo, columns, random, { side: 1, arriveIn: 0.6 })
          spawnFoe(dojo, columns, random, { side: -1, arriveIn: 0.6 })
        },
      })
      break
    case 'barge': {
      const foe = spawnFoe(dojo, columns, random, { side, arriveIn: 0.9 })
      dojo.nextMove = 'throw'
      say(dojo.chat, foe, tauntFor(rivalAt(foe.rival).id, random), 1.1)
      break
    }
    case 'roof':
      dropIn(dojo, columns, random, side, 3)
      dojo.nextMove = 'uppercut'
      later(dojo.chat, 'hero', pick(HERO_LINES.spotted, random), 1, 1.1)
      break
  }
}

// Something big: the boss that has been waiting, a rush from both sides, or a
// powerup out of the sky with rivals right behind it.
const startSetPiece = (dojo: Dojo, columns: number, random: () => number) => {
  const piece = dojo.isBossPending ? 'boss' : pickFresh(SET_PIECES, dojo.lastSetPiece, random)
  const center = dojo.x + BODY_WIDTH / 2
  dojo.lastSetPiece = piece

  switch (piece) {
    case 'boss':
      dojo.isBossPending = false

      if (dojo.boss === null) {
        spawnBoss(dojo, columns, random)
      }
      break
    case 'rush': {
      popWord(dojo.pops, 'RUSH!', center)
      const first = spawnFoe(dojo, columns, random, { side: 1, arriveIn: 0.9 })
      spawnFoe(dojo, columns, random, { side: -1, arriveIn: 0.9 })
      spawnFoe(dojo, columns, random, { side: 1, arriveIn: 1.5 })
      spawnFoe(dojo, columns, random, { side: -1, arriveIn: 1.5 })
      say(dojo.chat, first, pick(RIVAL_LINES.swarm, random), 1.4)
      later(dojo.chat, 'hero', pick(HERO_LINES.swarm, random), 0.8, 1.4)
      dojo.untilSpawn = 2.5
      break
    }
    case 'power':
      dropFrom(dojo.drops, pickFrom(POWERS, random), center + between(random, -20, 20), 1, random)
      dojo.cues.push({
        delay: 1.3,
        run: () => {
          spawnFoe(dojo, columns, random, { side: 1, arriveIn: 0.8 })
          spawnFoe(dojo, columns, random, { side: -1, arriveIn: 0.8 })
        },
      })
      dojo.untilSpawn = 2.5
      break
  }
}

const openAct = (dojo: Dojo, act: Act, columns: number, random: () => number) => {
  if (dojo.isOutro) {
    return
  }

  if (act === 1) {
    stowDrill(dojo, random)
    startIncident(dojo, columns, random)
  } else if (act === 2) {
    stowDrill(dojo, random)
    dojo.untilSpawn = Math.min(dojo.untilSpawn, 0.3)

    if (random() < 0.6) {
      later(dojo.chat, 'hero', pick(HERO_LINES.ready, random), 0.3, 1.3)
    }
  } else if (act === 3) {
    startSetPiece(dojo, columns, random)
  }
}

// A new turn: the session's waves, knockouts and powerup carry on, the floor
// is cleared, and Clawd is back in the middle, training.
export const beginDojoTurn = (dojo: Dojo, columns: number, random: () => number = Math.random) => {
  const kind = pickFresh(PRELUDES, dojo.lastPrelude, random)

  dojo.act = 0
  dojo.staged = 0
  dojo.isOutro = false
  dojo.x = homeOf(columns)
  dojo.isHome = true
  dojo.push = 0
  dojo.facing = 1
  dojo.move = null
  dojo.targets = []
  dojo.isBossTarget = false
  dojo.hurt = 0
  dojo.foes = []
  dojo.boss = null
  dojo.sparks = []
  dojo.pops = []
  dojo.rings = []
  dojo.drops = []
  dojo.cues = []
  dojo.nextMove = null
  dojo.look = 0
  dojo.chat = createTalk()
  dojo.waves.combo = 0
  dojo.waves.comboSeconds = 0
  dojo.lastPrelude = kind
  dojo.drill = { kind, seconds: 0, isBroken: false, swing: 0, swingSpeed: 0 }
}

// The turn is over: rivals up close get one last hit, the rest run, a boss
// backs off (it will be back), and Clawd signs off.
export const endDojoTurn = (dojo: Dojo, columns: number, random: () => number = Math.random) => {
  dojo.isOutro = true
  dojo.cues = []
  dojo.nextMove = null
  dojo.look = 0
  stowDrill(dojo, random)

  for (const foe of dojo.foes) {
    if (foe.state === 'held' || (foe.state === 'run' && foe.lift === 0 && Math.abs(foe.x - foeContact(dojo, foe)) < 6)) {
      launch(dojo, foe, foe.state === 'held' ? 'throw' : 'kick', columns, random)
    } else if (foe.state === 'run' || foe.state === 'scout') {
      foe.state = 'flee'
      foe.lift = 0
    }
  }
  dojo.move = null
  dojo.targets = []

  const boss = dojo.boss
  if (boss !== null && boss.ko === null) {
    boss.isLeaving = true
    dojo.isBossPending = true
    say(dojo.chat, 'boss', pick(BOSS_LINES.scared, random), 1.2)
    later(dojo.chat, 'hero', pick(HERO_LINES.outro, random), 0.3, 1.2)
  } else {
    say(dojo.chat, 'hero', pick(HERO_LINES.outro, random), 1.2)
  }
}

export const stepDojo = (dojo: Dojo, seconds: number, columns: number, random: () => number = Math.random) => {
  const home = homeOf(columns)

  dojo.seconds += seconds
  dojo.hurt = Math.max(0, dojo.hurt - seconds)
  dojo.push *= Math.max(0, 1 - seconds * 4)
  stepWaves(dojo.waves, seconds)

  if (dojo.power !== null) {
    dojo.power.seconds -= seconds

    if (dojo.power.seconds <= 0) {
      dojo.power = null
    }
  }

  if (!dojo.isHome) {
    dojo.x = Math.min(home, dojo.x + RUN_IN_SPEED * seconds)
    dojo.stride += seconds * 10
    dojo.isHome = dojo.x >= home
  } else {
    dojo.x = home + Math.round(dojo.push)
  }

  while (dojo.staged < dojo.act) {
    dojo.staged = (dojo.staged + 1) as Act
    openAct(dojo, dojo.staged, columns, random)
  }

  for (const cue of dojo.cues) {
    cue.delay -= seconds

    if (cue.delay <= 0 && !dojo.isOutro) {
      cue.run()
    }
  }
  dojo.cues = dojo.cues.filter(cue => cue.delay > 0)

  if (dojo.drill !== null) {
    stepDrill(dojo, dojo.drill, seconds, random)
  }

  if (dojo.look > 0 && dojo.move === null) {
    dojo.look = Math.max(0, dojo.look - seconds)
    dojo.facing = Math.floor(dojo.look / 0.3) % 2 === 0 ? 1 : -1
  }

  if (dojo.isBossPending && dojo.act >= 3 && !dojo.isOutro && dojo.boss === null) {
    dojo.isBossPending = false
    spawnBoss(dojo, columns, random)
  }

  // Rivals keep coming once the fight is on; none while a boss stands.
  dojo.untilSpawn -= seconds
  if (dojo.untilSpawn <= 0 && dojo.boss === null && dojo.act >= 2 && !dojo.isOutro) {
    const foe = spawnFoe(dojo, columns, random)
    dojo.untilSpawn = spawnSeconds(dojo.waves, random)

    if (random() < 0.08) {
      quip(dojo.chat, foe, tauntFor(rivalAt(foe.rival).id, random))
    }

    if (dojo.act < 4) {
      if (random() < DROP_IN_CHANCE) {
        foe.lift = DROP_HEIGHT
        foe.x = foeContact(dojo, foe) + foe.side * between(random, 4, 20)
      } else {
        foe.speed = Math.max(foe.speed, Math.abs(foe.x - foeContact(dojo, foe)) / between(random, ...ARRIVE_SECONDS))
      }
    }
  }

  for (const foe of dojo.foes) {
    if (foe.state === 'run' && foe.lift > 0) {
      foe.vy += GRAVITY * seconds
      foe.lift = Math.max(0, foe.lift - foe.vy * seconds)

      if (foe.lift === 0) {
        touchDown(dojo, foe, random)
      }
    } else if (foe.state === 'run' && foe.wait > 0) {
      foe.wait = Math.max(0, foe.wait - seconds)
    } else if (foe.state === 'run') {
      const stop = foeContact(dojo, foe)
      foe.x = foe.side > 0 ? Math.max(stop, foe.x - foe.speed * seconds) : Math.min(stop, foe.x + foe.speed * seconds)
      foe.stride += seconds * 8
    } else if (foe.state === 'scout') {
      // In from the edge to peek, a look around, then off the way it came.
      const peek = foe.side > 0 ? columns - widthOf(rivalAt(foe.rival)) - 4 : 4
      const isThere = foe.side > 0 ? foe.x <= peek : foe.x >= peek

      if (!isThere) {
        foe.x += -foe.side * SCOUT_SPEED * seconds
        foe.stride += seconds * 8
      } else {
        foe.wait -= seconds

        if (foe.wait <= 0) {
          foe.state = 'flee'
        }
      }
    } else if (foe.state === 'flee') {
      foe.x += foe.side * FLEE_SPEED * seconds
      foe.stride += seconds * 14
    } else if (foe.state === 'ko') {
      foe.ko += seconds
      foe.x += foe.vx * seconds
      foe.lift -= foe.vy * seconds
      foe.vy += GRAVITY * seconds
    }
  }

  if (isGiant(dojo) && dojo.isHome) {
    dojo.untilStomp -= seconds

    if (dojo.untilStomp <= 0) {
      dojo.untilStomp = STOMP_SECONDS
      stomp(dojo, columns, random)
    }
  }

  if (isRaging(dojo) && random() < 0.5) {
    burst(dojo.sparks, dojo.x + bodyWidth(dojo) / 2, GROUND - 2, 1, [0xff4d2e, 0xffb347], random, 6)
  }

  if (dojo.boss !== null) {
    stepBoss(dojo, dojo.boss, seconds, columns, random)
  }

  if (dojo.move === null && dojo.isHome && dojo.hurt === 0) {
    startMove(dojo, random)
  }

  if (dojo.move !== null) {
    const move = dojo.move
    dojo.moveSeconds += seconds * (isRaging(dojo) ? 1.5 : 1)

    if (move === 'spin') {
      dojo.facing = Math.floor(dojo.moveSeconds / 0.06) % 2 === 0 ? 1 : -1
    }

    if (!dojo.hasHit && dojo.moveSeconds >= MOVES[move].hitAt) {
      dojo.hasHit = true
      land(dojo, move, columns, random)
    }

    if (dojo.moveSeconds >= MOVES[move].seconds) {
      dojo.move = null
      dojo.targets = []
    }
  }

  dojo.foes = dojo.foes.filter(foe =>
    foe.state === 'ko'
      ? foe.ko < KO_SECONDS && foe.x > -12 && foe.x < columns + 12
      : foe.state !== 'flee' || (foe.x > -12 && foe.x < columns + 12),
  )

  const center = dojo.x + bodyWidth(dojo) / 2
  const { drops, arrived } = stepDrops(dojo.drops, seconds, center, GROUND - 6)
  dojo.drops = drops
  for (const power of arrived) {
    dojo.power = { kind: power, seconds: POWER_SECONDS }
    popWord(dojo.pops, `${POWER_NAMES[power]}!`, center)
    say(dojo.chat, 'hero', pick(HERO_LINES.dojoPower[power], random))
    burst(dojo.sparks, center, GROUND - 5, 14, [POWER_COLORS[power], 0xffffff], random, 20)
  }

  dojo.sparks = stepSparks(dojo.sparks, seconds)
  dojo.pops = stepPops(dojo.pops, seconds)
  dojo.rings = stepRings(dojo.rings, seconds)
  stepTalk(dojo.chat, seconds)
}

// Where each line is said: over Clawd, the boss, or a rival.
const speechOf = (dojo: Dojo): Speech[] =>
  dojo.chat.bubbles.flatMap(bubble => {
    if (bubble.who === 'hero') {
      return [{ text: bubble.text, x: dojo.x + bodyWidth(dojo) / 2, color: HERO_VOICE }]
    }

    if (bubble.who === 'boss') {
      const boss = dojo.boss
      return boss === null ? [] : [{ text: bubble.text, x: boss.x + bossWidth(boss) / 2, color: BOSS_VOICE }]
    }

    const foe = bubble.who
    const x = foe.state === 'held' ? heldAt(dojo, foe).x : foe.x

    return [{ text: bubble.text, x: x + widthOf(rivalAt(foe.rival)) / 2, color: rivalVoice(foe.rival) }]
  })

const poseOf = (dojo: Dojo): Pose => {
  if (dojo.move !== null) {
    return MOVES[dojo.move].pose
  }

  if (dojo.drill !== null) {
    return drillLook(dojo.drill).pose
  }

  return !dojo.isHome && Math.floor(dojo.stride) % 2 === 1 ? 'stride' : 'idle'
}

const hopOf = (dojo: Dojo) =>
  dojo.move === 'kick' || dojo.move === 'spin'
    ? Math.round(KICK_HOP * Math.sin((Math.PI * dojo.moveSeconds) / MOVES[dojo.move].seconds))
    : dojo.move === null && dojo.drill !== null
      ? drillLook(dojo.drill).lift
      : 0

// The strip: everyone drawn in pixels, or with `withActors` false only the
// effects, for the -img style to place pictures over.
export const dojoCells = (dojo: Dojo, columns: number, rows: number, withActors = true) => {
  const canvas = createCanvas(columns, rows)
  // In the -img style a rival with a picture is placed over the strip; one
  // without (a person's own design) is drawn here in pixels.
  const drawsRival = (rival: number) => withActors || !rivalAt(rival).hasPicture

  for (const foe of dojo.foes) {
    if (foe.state === 'ko') {
      const top = GROUND - spriteOf(foe.rival).length - Math.round(foe.lift)

      if (drawsRival(foe.rival)) {
        drawFoe(canvas, foe.rival, foe.x, { isFlipped: true, lift: foe.lift, fade: foe.ko / KO_SECONDS })
      }

      drawStars(canvas, Math.round(foe.x), widthOf(rivalAt(foe.rival)), top, foe.ko)
    }
  }

  if (dojo.drill !== null) {
    drawDrill(canvas, dojo, dojo.drill)
  }

  for (const foe of dojo.foes) {
    if (foe.state === 'run' || foe.state === 'scout' || foe.state === 'flee') {
      const top = GROUND - spriteOf(foe.rival).length - 1 - Math.round(foe.lift)

      if (drawsRival(foe.rival)) {
        drawFoe(canvas, foe.rival, foe.x, { stride: foe.stride, lift: foe.lift })
      }

      if (foe.wait > 0 && foe.state === 'run') {
        drawStars(canvas, Math.round(foe.x), widthOf(rivalAt(foe.rival)), top, foe.wait * 3)
      }
    }
  }

  const boss = dojo.boss
  if (boss !== null && drawsRival(boss.rival)) {
    drawFoe(canvas, boss.rival, boss.x, {
      height: BOSS_HEIGHT,
      lift: boss.lift,
      flash: boss.flash,
      isFlipped: boss.ko !== null,
      fade: boss.ko === null ? 0 : boss.ko / BOSS_KO_SECONDS,
    })
  }

  if (withActors) {
    drawHero(canvas, poseOf(dojo), dojo.facing, Math.round(dojo.x), GROUND, {
      lift: hopOf(dojo),
      flash: dojo.hurt > 0.15 ? 1 : 0,
      isRaging: isRaging(dojo),
      height: isGiant(dojo) ? GIANT_HEIGHT : undefined,
    })
  }

  for (const foe of dojo.foes) {
    if (foe.state === 'held' && drawsRival(foe.rival)) {
      const { x, lift, isFlipped } = heldAt(dojo, foe)
      drawFoe(canvas, foe.rival, x, { lift, isFlipped })
    }
  }

  drawRings(canvas, dojo.rings)
  drawSparks(canvas, dojo.sparks)
  drawDrops(canvas, dojo.drops, POWER_COLORS)

  const power = dojo.power === null ? null : { name: POWER_NAMES[dojo.power.kind], seconds: dojo.power.seconds }
  const hud = {
    left: scoreLine(dojo.waves, power),
    right: boss === null || boss.ko !== null ? undefined : `${rivalAt(boss.rival).label} ${hpBar(boss.hp, boss.maxHp)}`,
  }

  const blocked = withActors ? [] : topRowSpans(dojoActors(dojo))
  return packCanvas(canvas, hudOverlays(hud, dojo.pops, columns, speechOf(dojo), blocked))
}

// The -img style's pictures: rivals (facing the way they came), the one being
// thrown, the boss, and Clawd, giant or raging as the powerup says.
export const dojoActors = (dojo: Dojo): Actor[] => {
  const actors: Actor[] = []
  const place = (character: object, file: string, left: number, topPixel: number, width: number, rows: number) =>
    actors.push({ key: keyOf(character), file, left: Math.round(left), top: cellTop(topPixel), columns: width, rows })

  for (const foe of [...dojo.foes].sort((a, b) => Number(b.state === 'ko') - Number(a.state === 'ko'))) {
    if (foe.state === 'held' || !rivalAt(foe.rival).hasPicture) {
      continue
    }

    const frame = foe.state === 'ko' ? 'ko' : walkFrame(foe.stride)
    const isFacingRight = foe.state === 'flee' ? foe.side > 0 : foe.side < 0
    place(foe, rivalFile(foe.rival, frame, 0, isFacingRight), foe.x, GROUND - 8 - foe.lift, rivalColumns(foe.rival), 4)
  }

  const boss = dojo.boss
  if (boss !== null && rivalAt(boss.rival).hasPicture) {
    const frame = boss.ko !== null ? 'ko' : boss.flash > 0 ? 'hurt' : 'walk-0'
    place(boss, rivalFile(boss.rival, frame, 0, boss.isLeaving ? boss.side > 0 : boss.side < 0), boss.x, GROUND - BOSS_HEIGHT - boss.lift, rivalColumns(boss.rival, 5), 5)
  }

  const look = dojo.hurt > 0.15 ? 'flash' : isRaging(dojo) ? 'rage' : 'plain'
  const isBig = isGiant(dojo)
  const rows = isBig ? 5 : 4
  const width = isBig ? 20 : 16
  const left = Math.round(dojo.x) - (dojo.facing < 0 ? width - bodyWidth(dojo) : 0)
  place(dojo, heroFile(poseOf(dojo), look, dojo.facing), left, GROUND - rows * 2 - hopOf(dojo), width, rows)

  for (const foe of dojo.foes) {
    if (foe.state === 'held' && rivalAt(foe.rival).hasPicture) {
      const { x, lift, isFlipped } = heldAt(dojo, foe)
      place(foe, rivalFile(foe.rival, isFlipped ? 'ko' : 'hurt', 0, foe.side < 0), x, GROUND - 8 - lift, rivalColumns(foe.rival), 4)
    }
  }

  return actors
}
