// A turn plays as acts, so a short turn still tells a whole little story and
// a long one builds up to the full loop:
//
//   0 prelude    Pinch on its own, getting ready: practice, loading up.
//   1 incident   Something happens: a scout, a stray rival, a noise.
//   2 fight      The fight is on, without bosses or swarms yet.
//   3 set piece  Something big: a boss, a swarm, a powerup.
//   4 full       Everything, as long as the turn lasts.
//
// When each act starts follows the person's own turns: the first few turns
// use DEFAULT_PACING, then the arc stretches or shrinks to their median turn.

export type Act = 0 | 1 | 2 | 3 | 4

// The seconds into a turn that acts 1, 2, 3 and 4 start.
export type Pacing = readonly [number, number, number, number]

export const DEFAULT_PACING: Pacing = [1, 3, 8, 20]

// Turns to see before learning, and how many recent ones to keep.
export const MIN_SAMPLES = 10
export const MAX_SAMPLES = 30

// The default arc fits a 4 second turn.
const TYPICAL_SECONDS = 4

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

const median = (values: readonly number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

export const pacingFor = (turnSeconds: readonly number[]): Pacing => {
  if (turnSeconds.length < MIN_SAMPLES) {
    return DEFAULT_PACING
  }

  const scale = clamp(median(turnSeconds) / TYPICAL_SECONDS, 0.6, 2.5)
  const [incident, fight, setPiece, full] = DEFAULT_PACING

  return [clamp(incident * scale, 0.6, 1.2), fight * scale, setPiece * scale, full * scale]
}

export const actAt = (seconds: number, pacing: Pacing): Act => {
  const reached = pacing.filter(start => seconds >= start).length

  return reached as Act
}

// Adds a finished turn's length to the recent ones; very short turns (a
// slash command, an instant answer) say nothing about pacing.
export const remember = (turnSeconds: readonly number[], seconds: number) =>
  seconds < 0.5 ? [...turnSeconds] : [...turnSeconds, seconds].slice(-MAX_SAMPLES)

// Picks one of `options`, never the one picked last time.
export const pickFresh = <T>(options: readonly T[], last: T | undefined, random: () => number): T => {
  const fresh = options.length > 1 ? options.filter(option => option !== last) : options

  return fresh[Math.floor(random() * fresh.length)] ?? options[0]!
}
