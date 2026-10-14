// shooter: Clawd holds the line. Rivals run in from the right in
// escalating waves: some hop over bullets, some wear helmets that take a hit,
// and now and then a whole swarm rushes in. Clawd's pistol needs reloading;
// powerups bring a spread shot, rapid fire, a laser, homing missiles, a tank
// and a chopper. Every third wave a giant boss walks in and shoots back.
//
// A turn opens in acts (see acts.ts): Clawd practises or gears up alone, then
// something happens (a scout, a noise, a stray rival, an airdrop), then the
// fight is on, then a set piece, then the full loop.

import type { Act } from './acts'
import { pickFresh } from './acts'
import type { Drop, Pop, Ring, Speech, Spark, Waves } from './arena'
import {
  BOSS_HEIGHT,
  BOSS_VOICE,
  HERO_VOICE,
  GROUND,
  HIT_SPARKS,
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
import type { Actor } from './actors'
import { cellTop, heroFile, keyOf, rivalColumns, rivalFile, walkFrame } from './actors'
import { BOSS_LINES, HERO_LINES, RIVAL_LINES, named, pick, tauntFor } from './banter'
import { ARM_ROW, BODY_WIDTH, POSE_ROWS, drawHero } from './hero'
import type { Talk } from './talk'
import { createTalk, later, quip, say as sayTo, stepTalk } from './talk'
import type { Canvas } from './raster'
import { clamp, createCanvas, mix, packCanvas, plot, plotSprite } from './raster'
import { pickRival, rivalAt, widthOf } from './rivals'

export type Power = 'spread' | 'rapid' | 'laser' | 'missile' | 'tank' | 'chopper'
export type Vehicle = 'foot' | 'tank' | 'chopper'

// How often each powerup drops, relative to the others.
const POWER_WEIGHTS: Record<Power, number> = { spread: 2, rapid: 2, laser: 1, missile: 2, tank: 1, chopper: 1 }
const POWER_NAMES: Record<Power, string> = {
  spread: 'SPREAD',
  rapid: 'RAPID',
  laser: 'LASER',
  missile: 'MISSILES',
  tank: 'TANK',
  chopper: 'CHOPPER',
}
const POWER_COLORS: Record<Power, number> = {
  spread: 0x7fd4ff,
  rapid: 0xffe066,
  laser: 0xff5c8a,
  missile: 0xff8c42,
  tank: 0x8fa060,
  chopper: 0xb0b0b0,
}
const POWER_SECONDS: Record<Power, number> = { spread: 6, rapid: 6, laser: 5, missile: 7, tank: 9, chopper: 9 }
const DROP_CHANCE = 0.14

const HERO_LEFT = 1
const HERO_TOP = GROUND - POSE_ROWS
const MUZZLE = { x: HERO_LEFT + 16, y: HERO_TOP + ARM_ROW }

const BULLET = 0xffe066
const FLASH = 0xfff6c8
const LASER = { core: 0xffffff, glow: 0xff5c8a }
const BOSS_SHOT = { core: 0xffffff, glow: 0xb054ff }
const SMOKE = 0x8a8a8a
const FIRE = [0xffffff, 0xffe066, 0xff8c42, 0xe0301e]

const BULLET_SPEED = 80 // pixels a second
const FIRE_SECONDS = 0.4
const RAPID_SECONDS = 0.13
const MAGAZINE = 8
const RELOAD_SECONDS = 0.9
const MISSILE_SECONDS = 0.55
const SHELL_SECONDS = 0.75
const CHOPPER_GUN_SECONDS = 0.12
const BOMB_SECONDS = 0.9
const KO_SECONDS = 1.2
const GRAVITY = 40
const HOP_SECONDS = 0.5
const HOP_HEIGHT = 5
const SWARM_COOLDOWN = 14
// Into the outro, rivals still standing run off this fast.
const OUTRO_FLEE_SPEED = 70

const TAUNT_CHANCE = 0.08
const ROCKET = { body: 0x4a5530, tip: 0xff5c5c }
const BAZOOKA = { tube: 0x4a5530, rim: 0x2e2e2e }
// The bazooka rests on top of Clawd's head.
const BAZOOKA_ROW = 0

// Clawd in a tank, army helmet on, popping out of the hatch; facing right.
export const TANK = [
  '.....hhhh...........',
  '....hhhhhh..........',
  '.....oKoKo..........',
  '...tttttttttbbbbbbbb',
  '..ttttttttttt.......',
  'gggggggggggggggg....',
  'wvwvwvwvwvwvwvwv....',
  '.wwwwwwwwwwwwww.....',
]
export const TANK_TREADS = ['wvwvwvwvwvwvwvwv....', 'vwvwvwvwvwvwvwvw....']
export const TANK_PALETTE = {
  h: 0x5b6b3a,
  o: 0xd97757,
  K: 0x141414,
  t: 0x6b7f45,
  b: 0x4a5530,
  g: 0x55663a,
  w: 0x2e2e2e,
  v: 0x5a5a5a,
}

// Clawd flying a chopper, in the window; facing right.
export const CHOPPER = [
  '..rrrrrrrrrrrrrr..',
  '.........m........',
  '.......ccccccc....',
  'tttttcccowwwccc...',
  't....cccccccccc.gg',
  '.......s....s.....',
  '.....ssssssssss...',
]
export const ROTOR_SHORT = '......rrrrrr......'
export const CHOPPER_PALETTE = {
  r: 0xc8c8c8,
  m: 0x777777,
  c: 0x4b5d3a,
  t: 0x4b5d3a,
  o: 0xd97757,
  w: 0x9fd3e0,
  g: 0x333333,
  s: 0x777777,
}
const LAUNCHER = { tube: 0x6b7280, tip: 0xff5c5c }

// The opening acts' scenery.
const WOOD = { side: 0x8b5a2b, top: 0xa8713a }
const CAN = { lid: 0xd0d6de, body: 0xe05a4f }
const TARGET = { ring: 0xe0301e, white: 0xf2f2f2, hole: 0x141414 }
const SANDBAG = { top: 0xc2a36b, bottom: 0x8f7445 }
const CANOPY = [0xe8e8e8, 0x8fa060]
const BRASS = 0xd4a017
const DUST = 0xb8a88a

type Enemy = {
  rival: number
  x: number
  speed: number
  stride: number
  isHopper: boolean
  hop: number | null
  armor: number
  isFleeing: boolean
  ko: number | null
  lift: number
  vx: number
  vy: number
  // Dropping in from above, to land and run.
  isFalling: boolean
  // A scout stops at `stopAt`, looks for `peek` seconds, then runs for it.
  stopAt: number | null
  peek: number
}

// What a turn opens with, what happens next, and the big moment of act 3.
type Prelude = 'cans' | 'target' | 'reload' | 'sandbags'
type Incident = 'scout' | 'spotted' | 'stray' | 'airdrop'
type SetPiece = 'boss' | 'swarm' | 'airdrop'

const INCIDENTS: readonly Incident[] = ['scout', 'spotted', 'stray', 'airdrop']
const SET_PIECES: readonly SetPiece[] = ['boss', 'swarm', 'airdrop']

// Scenery Clawd practises on: cans on a crate, a target board, sandbags. A
// shot can flies off; a target keeps its holes; a bag drops into place.
type Prop = { kind: 'can' | 'crate' | 'target' | 'sandbag'; x: number; y: number; vx: number; vy: number; isDown: boolean; holes: number[] }

// A supply crate under a parachute; it opens on landing and its powerups fly
// to Clawd.
type Airdrop = { x: number; y: number; age: number; isOpen: boolean; powers: Power[] }

// Who is talking, what they say, and for a cutscene line what happens with it.
type Speaker = 'hero' | 'boss' | Enemy
type Line = { who: Speaker; text: string; seconds: number; action?: 'raise' | 'fire' }

type Bullet = { x: number; y: number; vx: number; vy: number }
type Missile = { x: number; y: number; vx: number; vy: number; age: number }
type Bomb = { x: number; y: number; vy: number }

type Boss = {
  rival: number
  x: number
  hp: number
  maxHp: number
  flash: number
  untilShot: number
  ko: number | null
  lift: number
  vy: number
  hasSpoken: boolean
  // Backing off at the end of a turn, to come back next time.
  isRetreating: boolean
}

export type Shooter = {
  waves: Waves
  enemies: Enemy[]
  bullets: Bullet[]
  missiles: Missile[]
  shells: Bullet[]
  bombs: Bomb[]
  shots: { x: number; y: number }[]
  boss: Boss | null
  sparks: Spark[]
  pops: Pop[]
  rings: Ring[]
  drops: Drop<Power>[]
  power: { kind: Power; seconds: number } | null
  untilSpawn: number
  untilSwarm: number
  untilShot: number
  untilBomb: number
  untilLaserTick: number
  rounds: number
  reload: number
  flash: number
  hurt: number
  // A scripted exchange (a boss's entrance) plays line by line.
  scene: Line[]
  sceneSeconds: number
  chat: Talk<Speaker>
  bazooka: boolean
  rockets: Missile[]
  // The acts: the one the clock says, the last one whose opening has played,
  // and what this turn opened with.
  act: Act
  playedAct: Act
  prelude: Prelude | null
  incident: Incident | null
  setPiece: SetPiece | null
  preludeSeconds: number
  incidentSeconds: number
  props: Prop[]
  airdrop: Airdrop | null
  // A boss the waves called for before act 3, or one that backed off.
  isBossPending: boolean
  isOutro: boolean
  seconds: number
}

export const createShooter = (): Shooter => ({
  waves: createWaves(),
  enemies: [],
  bullets: [],
  missiles: [],
  shells: [],
  bombs: [],
  shots: [],
  boss: null,
  sparks: [],
  pops: [],
  rings: [],
  drops: [],
  power: null,
  untilSpawn: 0.3,
  untilSwarm: SWARM_COOLDOWN,
  untilShot: 0,
  untilBomb: BOMB_SECONDS,
  untilLaserTick: 0,
  rounds: MAGAZINE,
  reload: 0,
  flash: 0,
  hurt: 0,
  scene: [],
  sceneSeconds: 0,
  chat: createTalk(),
  bazooka: false,
  rockets: [],
  act: 4,
  playedAct: 4,
  prelude: null,
  incident: null,
  setPiece: null,
  preludeSeconds: 0,
  incidentSeconds: 0,
  props: [],
  airdrop: null,
  isBossPending: false,
  isOutro: false,
  seconds: 0,
})

export const vehicleOf = (shooter: Shooter): Vehicle =>
  shooter.power?.kind === 'tank' ? 'tank' : shooter.power?.kind === 'chopper' ? 'chopper' : 'foot'

// Where the tank and the chopper are: the tank creeps back and forth, the
// chopper sweeps over the first third of the field and bobs.
export const tankAt = (shooter: Shooter) => ({ x: Math.round(HERO_LEFT + 2 + 2 * Math.sin(shooter.seconds * 1.3)), y: GROUND - TANK.length })

export const chopperAt = (shooter: Shooter, columns: number) => ({
  x: Math.round(4 + columns * 0.18 * (1 + Math.sin(shooter.seconds * 0.7))),
  y: 1 + Math.round(Math.sin(shooter.seconds * 3)),
})

// What can be hit: Clawd on foot, in the tank, or in the chopper.
const heroBox = (shooter: Shooter, columns: number) => {
  const vehicle = vehicleOf(shooter)

  if (vehicle === 'tank') {
    const { x, y } = tankAt(shooter)
    return { left: x, right: x + 16, top: y, bottom: GROUND - 1 }
  }

  if (vehicle === 'chopper') {
    const { x, y } = chopperAt(shooter, columns)
    return { left: x, right: x + 16, top: y, bottom: y + CHOPPER.length - 1 }
  }

  return { left: HERO_LEFT, right: HERO_LEFT + BODY_WIDTH, top: HERO_TOP, bottom: GROUND - 1 }
}

const enemyHeight = (enemy: Enemy) => spriteOf(enemy.rival).length + 1
const enemyTop = (enemy: Enemy) => GROUND - enemyHeight(enemy) - enemy.lift - (enemy.armor > 0 ? 1 : 0)
const enemyCenter = (enemy: Enemy) => ({ x: enemy.x + widthOf(rivalAt(enemy.rival)) / 2, y: GROUND - enemyHeight(enemy) / 2 - enemy.lift })
const isOnRow = (top: number, height: number, y: number) => y >= top && y <= top + height
const bossWidth = (boss: Boss) => spriteOf(boss.rival, BOSS_HEIGHT)[0]?.length ?? 10

const pickPower = (random: () => number): Power => {
  const powers = Object.keys(POWER_WEIGHTS) as Power[]
  let left = random() * powers.reduce((sum, power) => sum + POWER_WEIGHTS[power], 0)

  for (const power of powers) {
    left -= POWER_WEIGHTS[power]

    if (left < 0) {
      return power
    }
  }

  return 'spread'
}

// Banter: a scripted line goes up at once; idle chatter keeps quiet during a
// scene and waits out its cooldown.
const say = (shooter: Shooter, who: Speaker, text: string, life?: number) => sayTo(shooter.chat, who, text, life)

const chatter = (shooter: Shooter, who: Speaker, text: string) => {
  if (!isTalking(shooter)) {
    quip(shooter.chat, who, text)
  }
}

const isTalking = (shooter: Shooter) => shooter.scene.length > 0

// A boss's entrance: it introduces itself and brags. Clawd shrugs it off, or,
// when it will not stop talking, says "meh" and brings out a bazooka.
const bossIntro = (shooter: Shooter, boss: Boss, random: () => number): Line[] => {
  const name = rivalAt(boss.rival).label
  const opening: Line[] = [
    { who: 'boss', text: named(pick(BOSS_LINES.intro, random), name), seconds: 1.6 },
    { who: 'boss', text: pick(BOSS_LINES.brag, random), seconds: 1.5 },
  ]

  if (vehicleOf(shooter) !== 'foot' || random() < 0.5) {
    return [...opening, { who: 'hero', text: pick(HERO_LINES.reply, random), seconds: 1.3 }]
  }

  return [
    ...opening,
    { who: 'boss', text: pick(BOSS_LINES.ramble, random), seconds: 1.3 },
    { who: 'boss', text: pick(BOSS_LINES.ramble, random), seconds: 1.2 },
    { who: 'hero', text: pick(HERO_LINES.meh, random), seconds: 1.1 },
    { who: 'hero', text: '', seconds: 0.8, action: 'raise' },
    { who: 'boss', text: pick(BOSS_LINES.scared, random), seconds: 1 },
    { who: 'hero', text: pick(HERO_LINES.fire, random), seconds: 1.4, action: 'fire' },
  ]
}

const stepScene = (shooter: Shooter, seconds: number, random: () => number) => {
  stepTalk(shooter.chat, seconds)

  const line = shooter.scene[0]
  if (line === undefined) {
    return
  }

  if (shooter.sceneSeconds === 0) {
    if (line.text !== '') {
      say(shooter, line.who, line.text, line.seconds)
    }

    // The bazooka comes out: every rival in sight runs for it.
    if (line.action === 'raise') {
      shooter.bazooka = true
      const runners = shooter.enemies.filter(enemy => enemy.ko === null)
      for (const enemy of runners) {
        enemy.isFleeing = true
        enemy.isHopper = false
      }
      if (runners[0] !== undefined) {
        say(shooter, runners[0], pick(RIVAL_LINES.flee, random), 1.4)
      }
    }

    if (line.action === 'fire') {
      shooter.rockets.push({ x: HERO_LEFT + 16, y: HERO_TOP + BAZOOKA_ROW + 1, vx: 20, vy: 0, age: 0 })
      burst(shooter.sparks, HERO_LEFT, HERO_TOP + BAZOOKA_ROW + 1, 8, [SMOKE], random, 10, true)
    }
  }

  shooter.sceneSeconds += seconds

  if (shooter.sceneSeconds >= line.seconds) {
    shooter.scene.shift()
    shooter.sceneSeconds = 0
  }
}

const spawnEnemy = (shooter: Shooter, columns: number, random: () => number, rival = pickRival(random), speed = foeSpeed(shooter.waves, random)) => {
  const { wave } = shooter.waves
  const armor = wave >= 2 && random() < 0.25 + wave * 0.03 ? (wave >= 4 && random() < 0.35 ? 2 : 1) : 0

  const enemy: Enemy = {
    rival,
    x: columns,
    speed,
    stride: 0,
    isHopper: wave >= 2 && random() < 0.3,
    hop: null,
    armor,
    isFleeing: false,
    ko: null,
    lift: 0,
    vx: 0,
    vy: 0,
    isFalling: false,
    stopAt: null,
    peek: 0,
  }
  shooter.enemies.push(enemy)

  if (random() < TAUNT_CHANCE) {
    chatter(shooter, enemy, tauntFor(rivalAt(rival).id, random))
  }

  return enemy
}

// A rival dropping in from above at `x`, to land and run at Clawd.
const dropIn = (enemy: Enemy, x: number) => {
  enemy.x = Math.round(x)
  enemy.lift = 9
  enemy.vy = 0
  enemy.isFalling = true
  enemy.isHopper = false
}

// A swarm: a pack of one rival rushing in close together.
const spawnSwarm = (shooter: Shooter, columns: number, random: () => number) => {
  const rival = pickRival(random)
  const count = 7 + Math.min(8, shooter.waves.wave)

  for (let i = 0; i < count; i++) {
    spawnEnemy(shooter, columns, random, rival, between(random, 24, 32))
    shooter.enemies[shooter.enemies.length - 1]!.x = columns + i * between(random, 3, 6)
  }

  popWord(shooter.pops, 'SWARM!', columns * 0.6)
  say(shooter, shooter.enemies[shooter.enemies.length - count]!, pick(RIVAL_LINES.swarm, random), 1.8)
  say(shooter, 'hero', pick(HERO_LINES.swarm, random), 1.8)
}

const spawnBoss = (shooter: Shooter, columns: number, random: () => number) => {
  const hp = bossHp(shooter.waves)
  shooter.boss = { rival: pickRival(random), x: columns, hp, maxHp: hp, flash: 0, untilShot: 2, ko: null, lift: 0, vy: 0, hasSpoken: false, isRetreating: false }
  shooter.isBossPending = false
  popWord(shooter.pops, 'BOSS!', columns / 2)
}

const knockOut = (shooter: Shooter, enemy: Enemy, columns: number, random: () => number) => {
  enemy.ko = 0
  enemy.armor = 0
  enemy.vx = between(random, 14, 30)
  enemy.vy = -between(random, 10, 18)
  burst(shooter.sparks, enemy.x, MUZZLE.y, 8, HIT_SPARKS, random, 18)

  if (shooter.waves.combo >= 4 && random() < 0.3) {
    popWord(shooter.pops, pickFrom(['NICE', 'COMBO', 'BOOM'], random), enemy.x)
  }

  // Clawd is on a roll, and says so.
  if (shooter.waves.combo > 0 && shooter.waves.combo % 5 === 0) {
    say(shooter, 'hero', pick(HERO_LINES.streak, random))
  } else if (random() < 0.06) {
    chatter(shooter, 'hero', pick(HERO_LINES.streak, random))
  }

  if (random() < DROP_CHANCE) {
    dropFrom(shooter.drops, pickPower(random), enemy.x, MUZZLE.y, random)
  }

  // A boss before the set piece would crowd a short turn: it waits for act 3.
  if (countKo(shooter.waves)) {
    if (shooter.act >= 3 && !shooter.isOutro) {
      spawnBoss(shooter, columns, random)
    } else {
      shooter.isBossPending = true
    }
  }
}

// A bullet's hit: a helmet takes it first and flies off.
const shoot = (shooter: Shooter, enemy: Enemy, columns: number, random: () => number) => {
  if (enemy.armor > 0) {
    enemy.armor -= 1
    enemy.x += 1
    burst(shooter.sparks, enemy.x + 2, enemyTop(enemy), 6, [0x8fa060, 0xd0d6de, 0xffffff], random, 16)
    popWord(shooter.pops, 'TING!', enemy.x + 2)

    if (random() < 0.25) {
      chatter(shooter, enemy, pick(RIVAL_LINES.helmet, random))
    }

    return
  }

  knockOut(shooter, enemy, columns, random)
}

const hitBoss = (shooter: Shooter, damage: number, x: number, y: number, random: () => number) => {
  const boss = shooter.boss

  if (boss === null || boss.ko !== null) {
    return
  }

  boss.hp -= damage
  boss.flash = 0.08
  burst(shooter.sparks, x, y, 4, HIT_SPARKS, random, 14)

  if (boss.hp <= 0) {
    boss.ko = 0
    boss.vy = -14
    shooter.rings.push({ x: boss.x + bossWidth(boss) / 2, y: GROUND / 2, age: 0 })
    burst(shooter.sparks, boss.x + 5, GROUND / 2, 30, HIT_SPARKS, random, 30)
    popWord(shooter.pops, 'BOSS DOWN!', boss.x)
    say(shooter, 'boss', pick(BOSS_LINES.down, random), 1.4)
    say(shooter, 'hero', pick(HERO_LINES.bossDown, random), 1.8)
    dropFrom(shooter.drops, pickPower(random), boss.x, GROUND / 2, random)
    countBossDown(shooter.waves)
  }
}

// An explosion knocks out every rival in reach, helmets or not.
const explode = (shooter: Shooter, x: number, y: number, radius: number, columns: number, random: () => number) => {
  shooter.rings.push({ x, y, age: 0.15 })
  burst(shooter.sparks, x, y, 14, FIRE, random, 22)
  burst(shooter.sparks, x, y, 4, [SMOKE], random, 10, true)

  for (const enemy of shooter.enemies) {
    const center = enemyCenter(enemy)

    if (enemy.ko === null && Math.hypot(center.x - x, (center.y - y) * 1.5) <= radius + 3) {
      knockOut(shooter, enemy, columns, random)
    }
  }

  const boss = shooter.boss
  if (boss !== null && boss.ko === null && x >= boss.x - radius && x <= boss.x + bossWidth(boss) + radius) {
    hitBoss(shooter, 3, x, y, random)
  }
}

// A scout is only looking: Clawd holds fire.
const isTarget = (enemy: Enemy) => enemy.ko === null && !enemy.isFleeing && enemy.stopAt === null

const nearestTarget = (shooter: Shooter, x: number) => {
  const enemy = shooter.enemies
    .filter(foe => isTarget(foe) && foe.x > x)
    .sort((a, b) => a.x - b.x)[0]

  if (enemy !== undefined) {
    return enemyCenter(enemy)
  }

  const boss = shooter.boss
  return boss !== null && boss.ko === null ? { x: boss.x + bossWidth(boss) / 2, y: GROUND / 2 } : null
}

const fire = (shooter: Shooter, seconds: number, columns: number, random: () => number) => {
  if (isTalking(shooter) || shooter.bazooka) {
    return
  }

  const boss = shooter.boss
  const isTargetInView =
    shooter.enemies.some(enemy => isTarget(enemy) && enemy.x < columns - 2) ||
    (boss !== null && boss.ko === null && !boss.isRetreating && boss.x < columns - 2) ||
    shooter.props.some(isShootable)
  const kind = shooter.power?.kind

  shooter.untilShot -= seconds

  if (shooter.reload > 0) {
    shooter.reload -= seconds

    if (shooter.reload <= 0) {
      shooter.rounds = MAGAZINE
    }
  }

  if (kind === 'laser') {
    shooter.untilLaserTick -= seconds

    if (isTargetInView && shooter.untilLaserTick <= 0) {
      shooter.untilLaserTick = 0.15
      shooter.flash = 0.07

      for (const enemy of shooter.enemies) {
        if (isTarget(enemy) && enemy.x < columns && isOnRow(enemyTop(enemy), enemyHeight(enemy), MUZZLE.y)) {
          knockOut(shooter, enemy, columns, random)
        }
      }

      if (boss !== null) {
        hitBoss(shooter, 1, boss.x, MUZZLE.y, random)
      }

      shooter.shots = []
    }

    return
  }

  if (kind === 'chopper') {
    const { x, y } = chopperAt(shooter, columns)
    shooter.untilBomb -= seconds

    if (isTargetInView && shooter.untilShot <= 0) {
      shooter.bullets.push({ x: x + 17, y: y + 4, vx: 70, vy: 26 })
      shooter.untilShot = CHOPPER_GUN_SECONDS
      shooter.flash = 0.05
    }

    if (isTargetInView && shooter.untilBomb <= 0) {
      shooter.bombs.push({ x: x + 9, y: y + CHOPPER.length, vy: 0 })
      shooter.untilBomb = BOMB_SECONDS
    }

    return
  }

  if (!isTargetInView || shooter.untilShot > 0) {
    return
  }

  if (kind === 'tank') {
    const { x, y } = tankAt(shooter)
    shooter.shells.push({ x: x + 20, y: y + 3, vx: 90, vy: 0 })
    shooter.untilShot = SHELL_SECONDS
    shooter.flash = 0.1
    burst(shooter.sparks, x + 20, y + 3, 3, [SMOKE], random, 6, true)

    return
  }

  if (kind === 'missile') {
    shooter.missiles.push({ x: HERO_LEFT + 8, y: HERO_TOP - 1, vx: 30, vy: -6, age: 0 })
    shooter.untilShot = MISSILE_SECONDS

    return
  }

  // The pistol: a magazine, then a reload.
  if (shooter.reload > 0) {
    return
  }

  const spread = kind === 'spread' ? [-14, 0, 14] : [between(random, -2, 2)]
  for (const vy of spread) {
    shooter.bullets.push({ x: MUZZLE.x, y: MUZZLE.y, vx: BULLET_SPEED, vy })
  }
  shooter.untilShot = kind === 'rapid' ? RAPID_SECONDS : FIRE_SECONDS
  shooter.flash = 0.07

  if (kind !== 'rapid' && kind !== 'spread') {
    shooter.rounds -= 1

    if (shooter.rounds === 0) {
      shooter.reload = RELOAD_SECONDS

      if (random() < 0.4) {
        popWord(shooter.pops, 'RELOAD', MUZZLE.x)
      }
    }
  }
}

const stepProjectiles = (shooter: Shooter, seconds: number, columns: number, random: () => number) => {
  const boss = shooter.boss

  const bullets: Bullet[] = []
  for (const bullet of shooter.bullets) {
    const before = bullet.x
    bullet.x += bullet.vx * seconds
    bullet.y += bullet.vy * seconds

    const enemy = shooter.enemies.find(
      foe =>
        isTarget(foe) &&
        bullet.x >= foe.x &&
        before <= foe.x + widthOf(rivalAt(foe.rival)) &&
        isOnRow(enemyTop(foe), enemyHeight(foe), bullet.y),
    )
    const shot = shooter.shots.find(shot => Math.abs(shot.x - bullet.x) < 2 && Math.abs(shot.y - bullet.y) < 2)
    const isOnBoss = boss !== null && boss.ko === null && bullet.x >= boss.x && before <= boss.x + bossWidth(boss)
    const prop = shooter.props.find(
      prop => isShootable(prop) && bullet.x >= prop.x && before <= prop.x + propWidth(prop) - 1 && Math.abs(bullet.y - propMiddle(prop)) <= propHeight(prop) / 2 + 0.5,
    )

    if (enemy !== undefined) {
      shoot(shooter, enemy, columns, random)
    } else if (prop !== undefined) {
      hitProp(shooter, prop, bullet.y, random)
    } else if (shot !== undefined) {
      shooter.shots = shooter.shots.filter(other => other !== shot)
      burst(shooter.sparks, bullet.x, bullet.y, 6, [0xffffff, 0xd08cff], random, 14)
    } else if (isOnBoss) {
      hitBoss(shooter, 1, bullet.x, bullet.y, random)
    } else if (bullet.y >= GROUND - 1) {
      burst(shooter.sparks, bullet.x, GROUND - 1, 2, [SMOKE], random, 6, true)
    } else if (bullet.x < columns && bullet.y > 1) {
      bullets.push(bullet)
    }
  }
  shooter.bullets = bullets

  // Missiles climb, then home on the nearest rival.
  const missiles: Missile[] = []
  for (const missile of shooter.missiles) {
    missile.age += seconds
    const target = nearestTarget(shooter, missile.x)

    if (target !== null && missile.age > 0.15) {
      missile.vy += clamp(target.y - missile.y, -1, 1) * 120 * seconds
      missile.vy = clamp(missile.vy, -20, 20)
    }

    missile.vx = Math.min(75, missile.vx + 90 * seconds)
    missile.x += missile.vx * seconds
    missile.y += missile.vy * seconds

    if (random() < 0.7) {
      shooter.sparks.push({ x: missile.x - 2, y: missile.y, vx: -4, vy: -2, age: 0, life: 0.45, color: SMOKE, isSoft: true })
    }

    const isHit =
      shooter.enemies.some(
        foe => foe.ko === null && missile.x >= foe.x && missile.x <= foe.x + widthOf(rivalAt(foe.rival)) && isOnRow(enemyTop(foe), enemyHeight(foe), missile.y),
      ) ||
      (boss !== null && boss.ko === null && missile.x >= boss.x) ||
      missile.y >= GROUND - 1

    if (isHit) {
      explode(shooter, missile.x, missile.y, 6, columns, random)
    } else if (missile.x < columns + 4) {
      missiles.push(missile)
    }
  }
  shooter.missiles = missiles

  // Tank shells burst on the first thing they meet.
  const shells: Bullet[] = []
  for (const shell of shooter.shells) {
    shell.x += shell.vx * seconds

    const isHit =
      shooter.enemies.some(foe => foe.ko === null && shell.x >= foe.x && shell.x <= foe.x + widthOf(rivalAt(foe.rival))) ||
      (boss !== null && boss.ko === null && shell.x >= boss.x)

    if (isHit || shell.x >= columns - 1) {
      explode(shooter, shell.x, shell.y, 8, columns, random)
    } else {
      shells.push(shell)
    }
  }
  shooter.shells = shells

  // Bombs fall and burst on the ground.
  const bombs: Bomb[] = []
  for (const bomb of shooter.bombs) {
    bomb.vy += 60 * seconds
    bomb.y += bomb.vy * seconds
    bomb.x += 8 * seconds

    if (bomb.y >= GROUND - 2) {
      explode(shooter, bomb.x, GROUND - 3, 7, columns, random)
    } else {
      bombs.push(bomb)
    }
  }
  shooter.bombs = bombs

  // The bazooka's rocket: slow off the shoulder, then a very big bang.
  const rockets: Missile[] = []
  for (const rocket of shooter.rockets) {
    rocket.age += seconds
    rocket.vx = Math.min(95, rocket.vx + 120 * seconds)
    rocket.x += rocket.vx * seconds
    shooter.sparks.push({ x: rocket.x - 3, y: rocket.y + between(random, -0.5, 0.5), vx: -6, vy: -3, age: 0, life: 0.7, color: SMOKE, isSoft: true })

    const isAtBoss = boss !== null && boss.ko === null && rocket.x >= boss.x

    if (isAtBoss || rocket.x >= columns - 1) {
      if (boss !== null && boss.ko === null) {
        hitBoss(shooter, Math.ceil(boss.maxHp * 0.6), rocket.x, rocket.y, random)
      }

      explode(shooter, rocket.x, GROUND / 2, 14, columns, random)
      shooter.rings.push({ x: rocket.x, y: GROUND / 2, age: 0 }, { x: rocket.x, y: GROUND / 2, age: 0.2 })
      shooter.bazooka = false
    } else {
      rockets.push(rocket)
    }
  }
  shooter.rockets = rockets

  // The boss's shots fly at Clawd; they sting but Clawd holds.
  const box = heroBox(shooter, columns)
  for (const shot of shooter.shots) {
    shot.x -= 40 * seconds
  }
  for (const shot of shooter.shots) {
    if (shot.x <= box.right && shot.y >= box.top && shot.y <= box.bottom) {
      shooter.hurt = 0.25
      burst(shooter.sparks, box.right, shot.y, 8, [0xffffff, 0xd08cff], random, 16)
      popWord(shooter.pops, pickFrom(['OUCH', 'OOF', 'TCH'], random), box.right)

      if (random() < 0.4) {
        chatter(shooter, 'hero', pick(HERO_LINES.hurt, random))
      }
    }
  }
  shooter.shots = shooter.shots.filter(shot => shot.x > box.right && shot.x > 0)
}

// The acts. Props first: what each is, how big, and what a shot does to it.

const PROP_SIZES: Record<Prop['kind'], { width: number; height: number }> = {
  can: { width: 1, height: 2 },
  crate: { width: 9, height: 3 },
  target: { width: 3, height: 5 },
  sandbag: { width: 4, height: 2 },
}

const propWidth = (prop: Prop) => PROP_SIZES[prop.kind].width
const propHeight = (prop: Prop) => PROP_SIZES[prop.kind].height
const propMiddle = (prop: Prop) => prop.y + (propHeight(prop) - 1) / 2

const TARGET_HOLES = 3

const isShootable = (prop: Prop) =>
  (prop.kind === 'can' && !prop.isDown) || (prop.kind === 'target' && prop.holes.length < TARGET_HOLES)

const hitProp = (shooter: Shooter, prop: Prop, y: number, random: () => number) => {
  if (prop.kind === 'can') {
    prop.isDown = true
    prop.vx = between(random, 12, 24)
    prop.vy = -between(random, 12, 18)
    burst(shooter.sparks, prop.x, prop.y, 4, [CAN.lid, 0xffffff], random, 12)
    popWord(shooter.pops, pickFrom(['TINK!', 'PLINK!', 'TONK!'], random), prop.x)

    return
  }

  prop.holes.push(clamp(Math.round(y), prop.y, prop.y + propHeight(prop) - 1))
  burst(shooter.sparks, prop.x, y, 3, [WOOD.top, TARGET.white], random, 10)

  if (prop.holes.length === TARGET_HOLES) {
    popWord(shooter.pops, 'BULLSEYE!', prop.x + 1)
  }
}

// Where practice is set up: well clear of the gun, a third of the way in.
const practiceX = (columns: number) => Math.max(MUZZLE.x + 10, Math.round(columns * 0.38))
const bagsX = (shooter: Shooter) => HERO_LEFT + (vehicleOf(shooter) === 'foot' ? 21 : 27)

const dropBag = (shooter: Shooter, index: number) => {
  shooter.props.push({ kind: 'sandbag', x: bagsX(shooter) + index * 4, y: -3, vx: 0, vy: 0, isDown: false, holes: [] })
}

// What Clawd can do alone depends on what it holds: target practice needs
// the pistol (or a spread or rapid one); in a vehicle it can only dig in.
const preludesFor = (shooter: Shooter): Prelude[] => {
  const kind = shooter.power?.kind

  if (vehicleOf(shooter) !== 'foot') {
    return ['sandbags']
  }

  return kind === 'laser' || kind === 'missile' ? ['reload', 'sandbags'] : ['cans', 'target', 'reload', 'sandbags']
}

// Act 0: Clawd on its own, getting ready.
const startPrelude = (shooter: Shooter, columns: number, random: () => number) => {
  const prelude = pickFresh(preludesFor(shooter), shooter.prelude ?? undefined, random)
  shooter.prelude = prelude
  shooter.preludeSeconds = 0

  switch (prelude) {
    case 'cans': {
      // Three cans on a crate, shot off one by one.
      const x = practiceX(columns)
      shooter.props.push({ kind: 'crate', x: x - 3, y: GROUND - 3, vx: 0, vy: 0, isDown: false, holes: [] })

      for (const dx of [-2, 1, 4]) {
        shooter.props.push({ kind: 'can', x: x + dx, y: GROUND - 5, vx: 0, vy: 0, isDown: false, holes: [] })
      }
      break
    }
    case 'target':
      shooter.props.push({ kind: 'target', x: practiceX(columns), y: MUZZLE.y - 2, vx: 0, vy: 0, isDown: false, holes: [] })
      break
    case 'reload':
      // An empty magazine out, fresh rounds in, a test shot into the air.
      shooter.rounds = 0
      shooter.reload = 0.75
      popWord(shooter.pops, 'RELOAD', MUZZLE.x)
      break
    case 'sandbags':
      dropBag(shooter, 0)
      break
  }
}

const stepPrelude = (shooter: Shooter, seconds: number, random: () => number) => {
  const before = shooter.preludeSeconds
  shooter.preludeSeconds += seconds
  const isAt = (time: number) => before < time && shooter.preludeSeconds >= time

  if (shooter.prelude === 'reload') {
    // Rounds glint as they go in.
    if (shooter.preludeSeconds < 0.6 && random() < 0.5) {
      shooter.sparks.push({ x: MUZZLE.x - 6 + between(random, -1, 1), y: GROUND - 1, vx: 0, vy: -16, age: 0, life: 0.25, color: BRASS, isSoft: false })
    }

    if (isAt(0.8)) {
      popWord(shooter.pops, 'CLICK-CLACK!', MUZZLE.x)
    }

    if (isAt(1)) {
      shooter.bullets.push({ x: MUZZLE.x, y: MUZZLE.y, vx: 50, vy: -40 })
      shooter.flash = 0.07
    }
  }

  if (shooter.prelude === 'sandbags') {
    if (isAt(0.3)) {
      dropBag(shooter, 1)
    }

    if (isAt(0.6)) {
      dropBag(shooter, 2)
    }
  }

  // Shot cans fly and land; sandbags drop into place with a thud.
  for (const prop of shooter.props) {
    if (prop.kind === 'can' && prop.isDown && prop.y < GROUND - 1) {
      prop.vy += GRAVITY * 1.5 * seconds
      prop.x += prop.vx * seconds
      prop.y = Math.min(GROUND - 1, prop.y + prop.vy * seconds)
    }

    if (prop.kind === 'sandbag' && !prop.isDown) {
      prop.vy += 60 * seconds
      prop.y = Math.min(GROUND - 2, prop.y + prop.vy * seconds)

      if (prop.y === GROUND - 2) {
        prop.isDown = true
        burst(shooter.sparks, prop.x + 2, GROUND - 1, 5, [DUST], random, 10, true)
        popWord(shooter.pops, 'THUD', prop.x + 2)
      }
    }
  }
}

const startAirdrop = (shooter: Shooter, columns: number, powers: Power[]) => {
  shooter.airdrop = { x: Math.max(MUZZLE.x + 6, Math.round(columns * 0.3)), y: -5, age: 0, isOpen: false, powers }
}

// The crate drifts down; on landing it bursts open and its powerups fly out.
const stepAirdrop = (shooter: Shooter, seconds: number, random: () => number) => {
  const airdrop = shooter.airdrop
  if (airdrop === null) {
    return
  }

  airdrop.age += seconds

  if (!airdrop.isOpen) {
    airdrop.y = Math.min(GROUND - 3, airdrop.y + 8 * seconds)

    if (airdrop.y === GROUND - 3) {
      airdrop.isOpen = true
      airdrop.age = 0
      burst(shooter.sparks, airdrop.x + 1, GROUND - 3, 8, [WOOD.top, DUST], random, 14)
      popWord(shooter.pops, 'SUPPLIES!', airdrop.x + 1)

      for (const power of airdrop.powers) {
        dropFrom(shooter.drops, power, airdrop.x + 1, GROUND - 4, random)
      }
    }
  } else if (airdrop.age > 2.5) {
    shooter.airdrop = null
  }
}

// Act 1: something happens.
const startIncident = (shooter: Shooter, columns: number, random: () => number) => {
  const incident = pickFresh(INCIDENTS, shooter.incident ?? undefined, random)
  shooter.incident = incident
  shooter.incidentSeconds = 0

  switch (incident) {
    case 'scout': {
      // A rival wanders in, sees Clawd, and runs to tell the others.
      const scout = spawnEnemy(shooter, columns, random, pickRival(random), 32)
      scout.x = columns - 2
      scout.armor = 0
      scout.isHopper = false
      scout.stopAt = Math.round(columns * between(random, 0.62, 0.72))
      break
    }
    case 'spotted':
      // Clawd hears something; two rivals drop in a beat later.
      popWord(shooter.pops, '!', HERO_LEFT + 5)
      later(shooter.chat, 'hero', pick(HERO_LINES.spotted, random), 0.4, 1.3)
      break
    case 'stray':
      dropIn(spawnEnemy(shooter, columns, random), columns * between(random, 0.45, 0.6))
      break
    case 'airdrop':
      startAirdrop(shooter, columns, [pickPower(random)])
      break
  }
}

const stepIncident = (shooter: Shooter, seconds: number, columns: number, random: () => number) => {
  const before = shooter.incidentSeconds
  shooter.incidentSeconds += seconds

  if (shooter.incident === 'spotted' && before < 0.8 && shooter.incidentSeconds >= 0.8) {
    dropIn(spawnEnemy(shooter, columns, random), columns * 0.55)
    dropIn(spawnEnemy(shooter, columns, random), columns * 0.72)
  }
}

// Act 3: something big. A boss the waves held back comes first.
const startSetPiece = (shooter: Shooter, columns: number, random: () => number) => {
  const piece: SetPiece = shooter.isBossPending ? 'boss' : pickFresh(SET_PIECES, shooter.setPiece ?? undefined, random)
  shooter.setPiece = piece

  switch (piece) {
    case 'boss':
      if (shooter.boss === null) {
        spawnBoss(shooter, columns, random)
      }
      break
    case 'swarm':
      spawnSwarm(shooter, columns, random)
      shooter.untilSwarm = SWARM_COOLDOWN
      shooter.untilSpawn = 3
      break
    case 'airdrop':
      startAirdrop(shooter, columns, [pickFrom(['tank', 'chopper'] as const, random)])
      popWord(shooter.pops, 'AIRDROP!', columns / 2)
      break
  }
}

const enterAct = (shooter: Shooter, act: Act, columns: number, random: () => number) => {
  switch (act) {
    case 1:
      startIncident(shooter, columns, random)
      break
    case 2:
      // The fight is on.
      shooter.untilSpawn = 0.2

      if (random() < 0.6) {
        say(shooter, 'hero', pick(HERO_LINES.ready, random), 1.3)
      }
      break
    case 3:
      startSetPiece(shooter, columns, random)
      break
  }
}

// Plays each act's opening once, in order, as the clock reaches it.
const stepActs = (shooter: Shooter, seconds: number, columns: number, random: () => number) => {
  if (shooter.act < shooter.playedAct) {
    shooter.playedAct = shooter.act
  }

  while (shooter.playedAct < shooter.act && !shooter.isOutro) {
    shooter.playedAct = (shooter.playedAct + 1) as Act
    enterAct(shooter, shooter.playedAct, columns, random)
  }

  stepPrelude(shooter, seconds, random)
  stepIncident(shooter, seconds, columns, random)
  stepAirdrop(shooter, seconds, random)
}

// A new turn: the session's score, wave and powerup stay; the field is
// cleared and Clawd starts on its own. A boss left standing comes back later.
export const beginShooterTurn = (shooter: Shooter, columns: number, random: () => number = Math.random) => {
  if (shooter.boss !== null && shooter.boss.ko === null) {
    shooter.isBossPending = true
  }

  Object.assign(shooter, {
    enemies: [],
    bullets: [],
    missiles: [],
    shells: [],
    bombs: [],
    shots: [],
    boss: null,
    sparks: [],
    pops: [],
    rings: [],
    drops: [],
    scene: [],
    sceneSeconds: 0,
    chat: createTalk(),
    bazooka: false,
    rockets: [],
    props: [],
    airdrop: null,
    rounds: MAGAZINE,
    reload: 0,
    flash: 0,
    hurt: 0,
    untilSpawn: 0,
    act: 0,
    playedAct: 0,
    incidentSeconds: 0,
    isOutro: false,
  } satisfies Partial<Shooter>)
  shooter.waves.combo = 0
  shooter.waves.comboSeconds = 0

  startPrelude(shooter, columns, random)
}

// The turn is over: rivals near Clawd get one last pinch, the rest run off, a
// boss backs away (it will be back), and Clawd signs off.
export const endShooterTurn = (shooter: Shooter, columns: number, random: () => number = Math.random) => {
  shooter.isOutro = true
  shooter.scene = []
  shooter.bazooka = false

  for (const enemy of shooter.enemies) {
    if (enemy.ko !== null) {
      continue
    }

    enemy.isFalling = false
    enemy.stopAt = null
    enemy.hop = null
    enemy.lift = 0

    if (enemy.x < columns / 2 && !enemy.isFleeing) {
      knockOut(shooter, enemy, columns, random)
    } else {
      enemy.isFleeing = true
      enemy.isHopper = false
    }
  }

  const boss = shooter.boss
  if (boss !== null && boss.ko === null) {
    boss.isRetreating = true
    shooter.isBossPending = true
    say(shooter, 'boss', pick(BOSS_LINES.scared, random), 1.2)
  }

  say(shooter, 'hero', pick(HERO_LINES.outro, random), 1.4)
}

export const stepShooter = (shooter: Shooter, seconds: number, columns: number, random: () => number = Math.random) => {
  shooter.seconds += seconds
  shooter.flash = Math.max(0, shooter.flash - seconds)
  shooter.hurt = Math.max(0, shooter.hurt - seconds)
  shooter.untilSwarm -= seconds
  stepWaves(shooter.waves, seconds)
  stepScene(shooter, seconds, random)
  stepActs(shooter, seconds, columns, random)

  if (shooter.power !== null) {
    shooter.power.seconds -= seconds

    if (shooter.power.seconds <= 0) {
      shooter.power = null
    }
  }

  // Rivals come in waves once the fight is on, now and then as a swarm in the
  // full loop; none while a boss stands. Before the full loop some drop in
  // from above, so a short turn is not spent watching them walk.
  shooter.untilSpawn -= isTalking(shooter) ? 0 : seconds
  if (shooter.act >= 2 && !shooter.isOutro && shooter.untilSpawn <= 0 && shooter.boss === null) {
    if (shooter.act >= 4 && shooter.waves.wave >= 2 && shooter.untilSwarm <= 0 && random() < 0.25) {
      spawnSwarm(shooter, columns, random)
      shooter.untilSwarm = SWARM_COOLDOWN
      shooter.untilSpawn = 3
    } else {
      const enemy = spawnEnemy(shooter, columns, random)
      shooter.untilSpawn = spawnSeconds(shooter.waves, random)

      if (shooter.act < 4 && random() < 0.35) {
        dropIn(enemy, columns * between(random, 0.5, 0.8))
      }
    }
  }

  // A boss the waves called for earlier comes once the set piece has played.
  if (shooter.isBossPending && shooter.boss === null && shooter.playedAct >= 3 && !shooter.isOutro) {
    spawnBoss(shooter, columns, random)
  }

  for (const enemy of shooter.enemies) {
    if (enemy.ko !== null) {
      enemy.ko += seconds
      enemy.x += enemy.vx * seconds
      enemy.lift -= enemy.vy * seconds
      enemy.vy += GRAVITY * seconds
      continue
    }

    // Running from the bazooka (or the end of the turn): the other way, fast,
    // and gone.
    if (enemy.isFleeing) {
      enemy.x += (shooter.isOutro ? OUTRO_FLEE_SPEED : 34) * seconds
      enemy.stride += seconds * 14

      if (enemy.x > columns + 2) {
        enemy.ko = KO_SECONDS
      }
      continue
    }

    if (enemy.isFalling) {
      enemy.vy += GRAVITY * seconds
      enemy.lift = Math.max(0, enemy.lift - enemy.vy * seconds)

      if (enemy.lift === 0) {
        enemy.isFalling = false
        enemy.vy = 0
        burst(shooter.sparks, enemy.x + 2, GROUND - 1, 4, [DUST], random, 8, true)
      }
      continue
    }

    // A scout stops, has a look, says something, and runs for it.
    if (enemy.stopAt !== null && enemy.x <= enemy.stopAt) {
      enemy.x = enemy.stopAt
      const before = enemy.peek
      enemy.peek += seconds

      if (before === 0) {
        say(shooter, enemy, pick(RIVAL_LINES.scout, random), 1.3)
        popWord(shooter.pops, '!', HERO_LEFT + 5)
      }

      if (enemy.peek >= 1.1) {
        enemy.stopAt = null
        enemy.isFleeing = true
      }
      continue
    }

    enemy.x -= enemy.speed * seconds
    enemy.stride += seconds * 8

    // Hoppers jump a bullet that comes close.
    const isBulletClose = shooter.bullets.some(bullet => bullet.x < enemy.x && enemy.x - bullet.x < 10)
    if (enemy.isHopper && enemy.hop === null && isBulletClose && random() < 0.6) {
      enemy.hop = 0
    }

    if (enemy.hop !== null) {
      enemy.hop += seconds
      enemy.lift = HOP_HEIGHT * Math.sin((Math.PI * Math.min(enemy.hop, HOP_SECONDS)) / HOP_SECONDS)

      if (enemy.hop >= HOP_SECONDS) {
        enemy.hop = null
        enemy.lift = 0
      }
    } else {
      // Over the sandbags, not through them.
      const width = widthOf(rivalAt(enemy.rival))
      const isOnBags = shooter.props.some(prop => prop.kind === 'sandbag' && enemy.x < prop.x + propWidth(prop) && enemy.x + width > prop.x)
      enemy.lift = isOnBags ? 2 : 0
    }
  }

  // The boss walks in, bobs, and shoots back.
  const boss = shooter.boss
  if (boss !== null) {
    boss.flash = Math.max(0, boss.flash - seconds)

    if (boss.ko === null && boss.isRetreating) {
      boss.x += 40 * seconds
      boss.lift = Math.abs(Math.sin(shooter.seconds * 6))

      if (boss.x > columns + 2) {
        shooter.boss = null
      }
    } else if (boss.ko === null) {
      const stop = Math.round(columns * 0.7)
      boss.x = Math.max(stop, boss.x - 10 * seconds)
      boss.lift = Math.abs(Math.sin(shooter.seconds * 3))

      if (!boss.hasSpoken && boss.x === stop) {
        boss.hasSpoken = true
        shooter.scene = bossIntro(shooter, boss, random)
        shooter.sceneSeconds = 0
      }

      boss.untilShot -= isTalking(shooter) || shooter.bazooka ? 0 : seconds

      if (boss.untilShot <= 0) {
        shooter.shots.push({ x: boss.x - 1, y: MUZZLE.y })
        boss.untilShot = between(random, 1, 1.8)
      }
    } else {
      boss.ko += seconds
      boss.x += 20 * seconds
      boss.lift -= boss.vy * seconds
      boss.vy += GRAVITY * seconds

      if (boss.ko > 1.6) {
        shooter.boss = null
      }
    }
  }

  fire(shooter, seconds, columns, random)
  stepProjectiles(shooter, seconds, columns, random)

  // On the ground, anything that reaches Clawd gets pinched or run over; under
  // a chopper they slip past.
  const vehicle = vehicleOf(shooter)
  const box = heroBox(shooter, columns)
  for (const enemy of shooter.enemies) {
    if (enemy.ko !== null) {
      continue
    }

    if (enemy.isFleeing) {
      continue
    }

    if (vehicle !== 'chopper' && enemy.x <= box.right + 1) {
      knockOut(shooter, enemy, columns, random)
      popWord(shooter.pops, vehicle === 'tank' ? 'CRUNCH!' : 'PINCH!', box.right)
    } else if (vehicle === 'chopper' && enemy.x < -8) {
      enemy.ko = KO_SECONDS
    }
  }

  shooter.enemies = shooter.enemies.filter(
    enemy => enemy.ko === null || (enemy.ko < KO_SECONDS && enemy.x < columns + 10),
  )

  const { drops, arrived } = stepDrops(shooter.drops, seconds, (box.left + box.right) / 2, (box.top + box.bottom) / 2)
  shooter.drops = drops
  for (const power of arrived) {
    shooter.power = { kind: power, seconds: POWER_SECONDS[power] }
    shooter.rounds = MAGAZINE
    shooter.reload = 0
    popWord(shooter.pops, `${POWER_NAMES[power]}!`, box.right)
    say(shooter, 'hero', HERO_LINES.power[power])
    burst(shooter.sparks, (box.left + box.right) / 2, (box.top + box.bottom) / 2, 12, [POWER_COLORS[power], 0xffffff], random, 18)
  }

  shooter.sparks = stepSparks(shooter.sparks, seconds)
  shooter.pops = stepPops(shooter.pops, seconds)
  shooter.rings = stepRings(shooter.rings, seconds)
}

const drawVehicle = (canvas: Canvas, shooter: Shooter, columns: number) => {
  const vehicle = vehicleOf(shooter)
  const isHurt = shooter.hurt > 0.15

  if (vehicle === 'tank') {
    const { x, y } = tankAt(shooter)
    const recoil = shooter.flash > 0 ? -1 : 0
    const rows = [...TANK]
    rows[6] = TANK_TREADS[Math.floor(shooter.seconds * 12) % 2]!
    plotSprite(canvas, rows, isHurt ? { ...TANK_PALETTE, g: 0xffffff, t: 0xffffff } : TANK_PALETTE, x + recoil, y)

    if (shooter.flash > 0) {
      plot(canvas, x + 20 + recoil, y + 3, FLASH)
      plot(canvas, x + 21 + recoil, y + 2, BULLET)
      plot(canvas, x + 21 + recoil, y + 4, BULLET)
    }

    return
  }

  if (vehicle === 'chopper') {
    const { x, y } = chopperAt(shooter, columns)
    const rows = [...CHOPPER]
    rows[0] = Math.floor(shooter.seconds * 16) % 2 === 0 ? CHOPPER[0]! : ROTOR_SHORT
    plotSprite(canvas, rows, isHurt ? { ...CHOPPER_PALETTE, c: 0xffffff } : CHOPPER_PALETTE, x, y)

    if (shooter.flash > 0) {
      plot(canvas, x + 18, y + 4, FLASH)
    }

    return
  }

  // The bazooka rests on Clawd's shoulder, the gun put away.
  if (shooter.bazooka) {
    drawHero(canvas, 'idle', 1, HERO_LEFT, GROUND, { flash: isHurt ? 1 : 0 })

    for (let dx = 0; dx <= 15; dx++) {
      const color = dx === 0 || dx === 15 ? BAZOOKA.rim : BAZOOKA.tube
      plot(canvas, HERO_LEFT + dx, HERO_TOP + BAZOOKA_ROW + 1, color)
      plot(canvas, HERO_LEFT + dx, HERO_TOP + BAZOOKA_ROW, dx > 1 && dx < 14 ? BAZOOKA.tube : BAZOOKA.rim)
    }

    return
  }

  const recoil = shooter.flash > 0 && shooter.power?.kind !== 'missile' ? -1 : 0
  drawHero(canvas, 'gun', 1, HERO_LEFT + recoil, GROUND, { flash: isHurt ? 1 : 0 })

  if (shooter.power?.kind === 'missile') {
    for (let dx = 3; dx <= 8; dx++) {
      plot(canvas, HERO_LEFT + dx, HERO_TOP - 1, dx === 8 ? LAUNCHER.tip : LAUNCHER.tube)
    }
  }

  if (shooter.flash > 0 && shooter.power?.kind !== 'missile') {
    plot(canvas, MUZZLE.x + recoil, MUZZLE.y, FLASH)
    plot(canvas, MUZZLE.x + recoil + 1, MUZZLE.y - 1, BULLET)
    plot(canvas, MUZZLE.x + recoil + 1, MUZZLE.y + 1, BULLET)
  }

  // A reload: the magazine drops out under the gun.
  if (shooter.reload > 0) {
    plot(canvas, MUZZLE.x - 4, MUZZLE.y + 2 + Math.round((RELOAD_SECONDS - shooter.reload) * 4), 0x5c6068)
  }
}

// The opening acts' scenery, behind everyone; drawn in both styles.
const drawProps = (canvas: Canvas, shooter: Shooter) => {
  for (const prop of shooter.props) {
    const x = Math.round(prop.x)
    const y = Math.round(prop.y)

    switch (prop.kind) {
      case 'crate':
        for (let dx = 0; dx < propWidth(prop); dx++) {
          plot(canvas, x + dx, y, WOOD.top)
          plot(canvas, x + dx, y + 1, dx % 4 === 0 ? WOOD.top : WOOD.side)
          plot(canvas, x + dx, y + 2, WOOD.side)
        }
        break
      case 'can':
        // Standing, or tumbling end over end, or lying where it fell.
        if (!prop.isDown) {
          plot(canvas, x, y, CAN.lid)
          plot(canvas, x, y + 1, CAN.body)
        } else if (y < GROUND - 1 && Math.floor(prop.x) % 2 === 0) {
          plot(canvas, x, y, CAN.body)
          plot(canvas, x, y + 1, CAN.lid)
        } else {
          plot(canvas, x, y, CAN.body)
          plot(canvas, x + 1, y, CAN.lid)
        }
        break
      case 'target':
        // Rings from the bullseye out, on a post, with its holes.
        for (let dy = 0; dy < propHeight(prop); dy++) {
          const ring = Math.abs(dy - 2) % 2 === 0 ? TARGET.ring : TARGET.white

          for (let dx = 0; dx < propWidth(prop); dx++) {
            plot(canvas, x + dx, y + dy, dx === 1 || dy === 2 ? ring : TARGET.white)
          }
        }

        for (let postY = y + propHeight(prop); postY < GROUND; postY++) {
          plot(canvas, x + 1, postY, WOOD.side)
        }

        for (const hole of prop.holes) {
          plot(canvas, x, hole, TARGET.hole)
        }
        break
      case 'sandbag':
        for (let dx = 0; dx < propWidth(prop); dx++) {
          plot(canvas, x + dx, y, dx === 0 || dx === 3 ? SANDBAG.bottom : SANDBAG.top)
          plot(canvas, x + dx, y + 1, SANDBAG.bottom)
        }
        break
    }
  }

  // The airdrop: a crate under a striped canopy, or burst open.
  const airdrop = shooter.airdrop
  if (airdrop !== null) {
    const x = airdrop.x
    const y = Math.round(airdrop.y)

    if (!airdrop.isOpen) {
      for (let dx = -2; dx <= 4; dx++) {
        plot(canvas, x + dx, y - 4 + (dx === -2 || dx === 4 ? 1 : 0), CANOPY[(dx + 2) % 2]!)
      }
      plot(canvas, x - 1, y - 2, 0x9a9a9a)
      plot(canvas, x + 3, y - 2, 0x9a9a9a)
      plot(canvas, x, y - 1, 0x9a9a9a)
      plot(canvas, x + 2, y - 1, 0x9a9a9a)
    }

    for (let dx = 0; dx < 3; dx++) {
      for (let dy = airdrop.isOpen ? 1 : 0; dy < 3; dy++) {
        plot(canvas, x + dx, y + dy, dx === 1 || dy === 1 ? WOOD.top : WOOD.side)
      }
    }
  }
}

// The strip: everyone drawn in pixels, or with `withActors` false only the
// effects, for the -img style to place pictures over.
export const shooterCells = (shooter: Shooter, columns: number, rows: number, withActors = true) => {
  const canvas = createCanvas(columns, rows)
  drawProps(canvas, shooter)
  // In the -img style a rival with a picture is placed over the strip; one
  // without (a person's own design) is drawn here in pixels.
  const drawsRival = (rival: number) => withActors || !rivalAt(rival).hasPicture

  for (const enemy of shooter.enemies) {
    if (enemy.ko !== null) {
      const top = GROUND - enemyHeight(enemy) - Math.round(enemy.lift)

      if (drawsRival(enemy.rival)) {
        drawFoe(canvas, enemy.rival, enemy.x, { isFlipped: true, lift: enemy.lift, fade: enemy.ko / KO_SECONDS })
      }

      drawStars(canvas, Math.round(enemy.x), widthOf(rivalAt(enemy.rival)), top, enemy.ko)
    }
  }

  for (const enemy of shooter.enemies) {
    if (enemy.ko === null && drawsRival(enemy.rival)) {
      drawFoe(canvas, enemy.rival, enemy.x, { stride: enemy.stride, lift: enemy.lift, helmet: enemy.armor })
    }
  }

  const boss = shooter.boss
  if (boss !== null && drawsRival(boss.rival)) {
    drawFoe(canvas, boss.rival, boss.x, {
      height: BOSS_HEIGHT,
      lift: boss.lift,
      flash: boss.flash,
      isFlipped: boss.ko !== null,
      fade: boss.ko === null ? 0 : boss.ko / 1.6,
    })
  }

  for (const shot of shooter.shots) {
    plot(canvas, shot.x + 1, shot.y, BOSS_SHOT.glow)
    plot(canvas, shot.x, shot.y - 1, BOSS_SHOT.glow)
    plot(canvas, shot.x, shot.y + 1, BOSS_SHOT.glow)
    plot(canvas, shot.x, shot.y, BOSS_SHOT.core)
  }

  for (const bullet of shooter.bullets) {
    plot(canvas, bullet.x, bullet.y, BULLET)
    plot(canvas, bullet.x - 1, bullet.y - bullet.vy / bullet.vx, mix(BULLET, 0x555555, 0.5))
  }

  for (const missile of shooter.missiles) {
    plot(canvas, missile.x, missile.y, LAUNCHER.tip)
    plot(canvas, missile.x - 1, missile.y, 0xd0d0d0)
    plot(canvas, missile.x - 2, missile.y, Math.floor(missile.age * 20) % 2 === 0 ? 0xffe066 : 0xff8c42)
  }

  for (const rocket of shooter.rockets) {
    plot(canvas, rocket.x, rocket.y, ROCKET.tip)
    plot(canvas, rocket.x - 1, rocket.y, ROCKET.body)
    plot(canvas, rocket.x - 2, rocket.y, ROCKET.body)
    plot(canvas, rocket.x - 3, rocket.y, Math.floor(rocket.age * 20) % 2 === 0 ? 0xffe066 : 0xff8c42)
  }

  for (const shell of shooter.shells) {
    plot(canvas, shell.x, shell.y, 0xffffff)
    plot(canvas, shell.x - 1, shell.y, 0xffe066)
  }

  for (const bomb of shooter.bombs) {
    plot(canvas, bomb.x, bomb.y, 0x333333)
    plot(canvas, bomb.x, bomb.y + 1, 0xff5c5c)
  }

  if (shooter.power?.kind === 'laser' && shooter.flash > 0) {
    for (let x = MUZZLE.x; x < columns; x++) {
      plot(canvas, x, MUZZLE.y, LASER.core)
      plot(canvas, x, MUZZLE.y - 1, LASER.glow)
      plot(canvas, x, MUZZLE.y + 1, LASER.glow)
    }
  }

  drawRings(canvas, shooter.rings)
  drawSparks(canvas, shooter.sparks)
  drawDrops(canvas, shooter.drops, POWER_COLORS)

  if (withActors) {
    drawVehicle(canvas, shooter, columns)
  } else if (shooter.power?.kind === 'missile' && vehicleOf(shooter) === 'foot' && !shooter.bazooka) {
    for (let dx = 3; dx <= 8; dx++) {
      plot(canvas, HERO_LEFT + dx, HERO_TOP - 1, dx === 8 ? LAUNCHER.tip : LAUNCHER.tube)
    }
  }

  const power = shooter.power === null ? null : { name: POWER_NAMES[shooter.power.kind], seconds: shooter.power.seconds }
  const hud = {
    left: scoreLine(shooter.waves, power),
    right: boss === null || boss.ko !== null ? undefined : `${rivalAt(boss.rival).label} ${hpBar(boss.hp, boss.maxHp)}`,
  }

  return packCanvas(canvas, hudOverlays(hud, shooter.pops, columns, speechOf(shooter, columns)))
}

// Where each line is said: over Clawd (or its ride), the boss, or a rival.
const speechOf = (shooter: Shooter, columns: number): Speech[] => {
  const box = heroBox(shooter, columns)

  return shooter.chat.bubbles.flatMap(bubble => {
    if (bubble.who === 'hero') {
      return [{ text: bubble.text, x: (box.left + box.right) / 2 + 4, color: HERO_VOICE }]
    }

    if (bubble.who === 'boss') {
      const boss = shooter.boss
      return boss === null ? [] : [{ text: bubble.text, x: boss.x + bossWidth(boss) / 2, color: BOSS_VOICE }]
    }

    const enemy = bubble.who

    return [{ text: bubble.text, x: enemy.x + widthOf(rivalAt(enemy.rival)) / 2, color: rivalVoice(enemy.rival) }]
  })
}

// The -img style's pictures: rivals running or knocked out, the boss, and
// Clawd on foot, in the tank or in the chopper.
export const shooterActors = (shooter: Shooter, columns: number): Actor[] => {
  const actors: Actor[] = []
  const place = (character: object, file: string, left: number, topPixel: number, width: number, rows: number) =>
    actors.push({ key: keyOf(character), file, left: Math.round(left), top: cellTop(topPixel), columns: width, rows })

  for (const enemy of [...shooter.enemies].sort((a, b) => Number(b.ko !== null) - Number(a.ko !== null))) {
    if (!rivalAt(enemy.rival).hasPicture) {
      continue
    }

    const frame = enemy.ko !== null ? 'ko' : walkFrame(enemy.stride)
    place(enemy, rivalFile(enemy.rival, frame, enemy.armor, enemy.isFleeing), enemy.x, GROUND - 8 - enemy.lift, rivalColumns(enemy.rival), 4)
  }

  const boss = shooter.boss
  if (boss !== null && rivalAt(boss.rival).hasPicture) {
    const frame = boss.ko !== null ? 'ko' : boss.flash > 0 ? 'hurt' : 'walk-0'
    place(boss, rivalFile(boss.rival, frame), boss.x, GROUND - BOSS_HEIGHT - boss.lift, rivalColumns(boss.rival, 5), 5)
  }

  const isHurt = shooter.hurt > 0.15
  const vehicle = vehicleOf(shooter)

  if (vehicle === 'tank') {
    const { x, y } = tankAt(shooter)
    const treads = Math.floor(shooter.seconds * 12) % 2
    place(shooter, `vehicles/tank-${treads}${isHurt ? '-flash' : ''}.png`, x - (shooter.flash > 0 ? 1 : 0), y, 20, 4)
  } else if (vehicle === 'chopper') {
    const { x, y } = chopperAt(shooter, columns)
    const rotor = Math.floor(shooter.seconds * 16) % 2
    place(shooter, `vehicles/chopper-${rotor}${isHurt ? '-flash' : ''}.png`, x, y, 18, 4)
  } else {
    const recoil = shooter.flash > 0 && shooter.power?.kind !== 'missile' ? -1 : 0
    const file = shooter.bazooka ? heroFile('bazooka') : heroFile('gun', isHurt ? 'flash' : 'plain')
    place(shooter, file, HERO_LEFT + recoil, HERO_TOP, 16, 4)
  }

  return actors
}
