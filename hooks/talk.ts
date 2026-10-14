// Speech bubbles for Clawd's fights: one line per speaker at a time. Idle
// chatter waits out a cooldown so it never crowds the line; scripted lines
// (`say`) go up at once.

export type Bubble<S> = { who: S; text: string; age: number; life: number }

type Pending<S> = { who: S; text: string; delay: number; life?: number }

export type Talk<S> = { bubbles: Bubble<S>[]; pending: Pending<S>[]; untilQuip: number }

const QUIP_COOLDOWN = 3

export const createTalk = <S>(): Talk<S> => ({ bubbles: [], pending: [], untilQuip: 1 })

export const say = <S>(talk: Talk<S>, who: S, text: string, life = 1.6) => {
  talk.bubbles = talk.bubbles.filter(bubble => bubble.who !== who)
  talk.bubbles.push({ who, text, age: 0, life })
}

export const quip = <S>(talk: Talk<S>, who: S, text: string) => {
  if (talk.untilQuip <= 0) {
    say(talk, who, text)
    talk.untilQuip = QUIP_COOLDOWN
  }
}

// A reply: said once `delay` seconds have passed.
export const later = <S>(talk: Talk<S>, who: S, text: string, delay: number, life?: number) => {
  talk.pending.push({ who, text, delay, life })
}

export const stepTalk = <S>(talk: Talk<S>, seconds: number) => {
  talk.untilQuip -= seconds

  for (const line of talk.pending) {
    line.delay -= seconds

    if (line.delay <= 0) {
      say(talk, line.who, line.text, line.life)
    }
  }
  talk.pending = talk.pending.filter(line => line.delay > 0)

  for (const bubble of talk.bubbles) {
    bubble.age += seconds
  }

  talk.bubbles = talk.bubbles.filter(bubble => bubble.age < bubble.life)
}
