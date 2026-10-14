import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { AnimStyle } from '../types'
import type { Act, Pacing } from './acts'
import { DEFAULT_PACING, actAt, pacingFor, pickFresh, remember } from './acts'
import type { Actor } from './actors'
import { ARENA_ROWS } from './arena'
import { beachCells, beachPicture, beginBeach, createBeach, stepBeach } from './beach'
import { CONTENT_PATH, applyContent } from './content'
import { beginCruise, createCruise, cruiseCells, cruisePicture, stepCruise } from './cruise'
import { beginDojoTurn, createDojo, dojoActors, dojoCells, endDojoTurn, stepDojo } from './dojo'
import { beginKnightTurn, createKnight, endKnightTurn, knightActors, knightCells, stepKnight } from './knight'
import { beginMeditation, createMeditation, meditationCells, meditationPicture, stepMeditation } from './meditation'
import { beginShooterTurn, createShooter, endShooterTurn, shooterActors, shooterCells, stepShooter } from './shooter'

const style = atom({ plugin: 'loader-arcade-unhinged', key: 'style' } as const, 'fight')
const isPreviewing = atom({ plugin: 'loader-arcade-unhinged', key: 'isPreviewing' } as const, false)
const isOutro = atom({ plugin: 'loader-arcade-unhinged', key: 'isOutro' } as const, false)
const imgFrame = atom({ plugin: 'loader-arcade-unhinged', key: 'imgFrame' } as const, 0)

const FRAME_MS = 66
const PREVIEW_MS = 8000
const OUTRO_MS = 1200
const BAND_KEY = 'arcade'
const STYLE_STORE_KEY = 'style'
const PICTURES_STORE_KEY = 'pictures'
const TURNS_STORE_KEY = 'turnSeconds'

// A preview runs the arc faster, so a few seconds show the build-up.
const PREVIEW_PACING: Pacing = [1, 2.5, 5, 60]

const STYLES: readonly AnimStyle[] = [
  'fight',
  'fight-shooter',
  'fight-dojo',
  'fight-knight',
  'chill',
  'chill-beach',
  'chill-drive',
  'chill-meditation',
  'off',
]

// The names before themes, still understood (and migrated when saved).
const LEGACY: Readonly<Record<string, AnimStyle>> = {
  shooter: 'fight-shooter',
  'shooter-img': 'fight-shooter',
  dojo: 'fight-dojo',
  'dojo-img': 'fight-dojo',
  knight: 'fight-knight',
  'knight-img': 'fight-knight',
  aura: 'chill-meditation',
  drift: 'chill-drive',
}

type Scene = 'shooter' | 'dojo' | 'knight' | 'beach' | 'drive' | 'meditation'

const FIGHTS: readonly Scene[] = ['shooter', 'dojo', 'knight']
const CHILLS: readonly Scene[] = ['beach', 'drive', 'meditation']

// A style plays one scene, or a theme's scenes in turn.
const SCENES_OF: Record<Exclude<AnimStyle, 'off'>, readonly Scene[]> = {
  fight: FIGHTS,
  'fight-shooter': ['shooter'],
  'fight-dojo': ['dojo'],
  'fight-knight': ['knight'],
  chill: CHILLS,
  'chill-beach': ['beach'],
  'chill-drive': ['drive'],
  'chill-meditation': ['meditation'],
}

const isFight = (scene: Scene) => FIGHTS.includes(scene)

const BAND_ROWS: Record<Scene, number> = { shooter: ARENA_ROWS, dojo: ARENA_ROWS, knight: ARENA_ROWS, beach: 5, drive: 4, meditation: 5 }

const SPINNER_WORDS: Record<Scene, readonly string[]> = {
  shooter: ['Clawing', 'Locking and loading', 'Holding the line', 'Shell-shocking', 'Boss hunting'],
  dojo: ['Karate chopping', 'Judo throwing', 'Flying kicking', 'Hiyaa-ing', 'Defending the dojo'],
  knight: ['Dueling', 'Parrying', 'Unsheathing', 'Riposting', 'Slicing'],
  beach: ['Sunbathing', 'Beachcombing', 'Building sandcastles', 'Watching the tide'],
  drive: ['Cruising', 'Taking the scenic route', 'Rolling along', 'Chasing the sunset'],
  meditation: ['Meditating', 'Breathing in', 'Finding center', 'Letting go'],
}

const toStyle = (value: unknown): AnimStyle | undefined => {
  if (typeof value !== 'string') {
    return undefined
  }

  return (STYLES as readonly string[]).includes(value) ? (value as AnimStyle) : LEGACY[value]
}

// How the band is drawn: cells, cells with pictures of the fighters over them,
// or (a chill scene where pictures show) one picture repainted every frame.
type BandMount = { requestId: string; columns: number; rows: number; isImg: boolean; isPicture: boolean }

const band: {
  timer: Timer | undefined
  // Frames since the turn (or preview) began.
  frame: number
  mount: BandMount | undefined
  style: AnimStyle
  scene: Scene
  act: Act
  isWorking: boolean
  isPreviewing: boolean
  isOutro: boolean
  pacing: Pacing
  turnSeconds: number[]
  shooter: ReturnType<typeof createShooter>
  dojo: ReturnType<typeof createDojo>
  knight: ReturnType<typeof createKnight>
  beach: ReturnType<typeof createBeach>
  drive: ReturnType<typeof createCruise>
  meditation: ReturnType<typeof createMeditation>
  word: string | undefined
  hasGraphics: boolean
  hasPictures: boolean
  root: string
  contentNotes: string[]
  contentFile: string
} = {
  timer: undefined,
  frame: 0,
  mount: undefined,
  style: 'fight',
  scene: 'shooter',
  act: 0,
  isWorking: false,
  isPreviewing: false,
  isOutro: false,
  pacing: DEFAULT_PACING,
  turnSeconds: [],
  shooter: createShooter(),
  dojo: createDojo(),
  knight: createKnight(),
  beach: createBeach(),
  drive: createCruise(),
  meditation: createMeditation(),
  word: undefined,
  hasGraphics: false,
  hasPictures: true,
  root: '',
  contentNotes: [],
  contentFile: '',
}

const bandColumns = () => band.mount?.columns ?? 80

function frameCells(columns: number, rows: number, withActors = true) {
  switch (band.scene) {
    case 'shooter':
      return shooterCells(band.shooter, columns, rows, withActors)
    case 'dojo':
      return dojoCells(band.dojo, columns, rows, withActors)
    case 'knight':
      return knightCells(band.knight, columns, rows, withActors)
    case 'beach':
      return beachCells(band.beach, columns, rows)
    case 'drive':
      return cruiseCells(band.drive, columns, rows)
    case 'meditation':
      return meditationCells(band.meditation, columns, rows)
  }
}

// A chill scene's frame as one picture, or undefined for the fights.
function framePicture(columns: number, rows: number) {
  switch (band.scene) {
    case 'beach':
      return beachPicture(band.beach, columns, rows)
    case 'drive':
      return cruisePicture(band.drive, columns, rows)
    case 'meditation':
      return meditationPicture(band.meditation, columns, rows)
    default:
      return undefined
  }
}

// Moves the scene on a frame, in the act the turn has reached. The chill
// scenes count time within an act; the fights notice a new act themselves.
function stepScene(columns: number) {
  const seconds = FRAME_MS / 1000
  const pacing = band.isPreviewing && !band.isWorking ? PREVIEW_PACING : band.pacing
  const act = band.isOutro ? band.act : actAt((band.frame * FRAME_MS) / 1000, pacing)
  const chill = band.scene === 'beach' ? band.beach : band.scene === 'drive' ? band.drive : band.scene === 'meditation' ? band.meditation : undefined

  if (chill !== undefined && chill.act !== act) {
    chill.actSeconds = 0
  }
  band.act = act

  switch (band.scene) {
    case 'shooter':
      band.shooter.act = act
      return stepShooter(band.shooter, seconds, columns)
    case 'dojo':
      band.dojo.act = act
      return stepDojo(band.dojo, seconds, columns)
    case 'knight':
      band.knight.act = act
      return stepKnight(band.knight, seconds, columns)
    case 'beach':
      band.beach.act = act
      return stepBeach(band.beach, seconds, columns)
    case 'drive':
      band.drive.act = act
      return stepCruise(band.drive, seconds, columns)
    case 'meditation':
      band.meditation.act = act
      return stepMeditation(band.meditation, seconds, columns)
  }
}

// The characters of a fight, drawn as pictures over the strip.
function sceneActors(scene: Scene): ((columns: number) => Actor[]) | undefined {
  switch (scene) {
    case 'shooter':
      return columns => shooterActors(band.shooter, columns)
    case 'dojo':
      return () => dojoActors(band.dojo)
    case 'knight':
      return () => knightActors(band.knight)
    default:
      return undefined
  }
}

// A new turn: the style's next scene starts again from its prelude. A fight
// keeps its waves and knockouts from earlier turns.
function beginTurn() {
  if (band.style === 'off') {
    return
  }

  const scenes = SCENES_OF[band.style]
  band.scene = pickFresh(scenes, band.scene, Math.random)
  band.frame = 0
  band.act = 0
  band.isOutro = false

  const columns = bandColumns()
  switch (band.scene) {
    case 'shooter':
      return beginShooterTurn(band.shooter, columns)
    case 'dojo':
      return beginDojoTurn(band.dojo, columns)
    case 'knight':
      return beginKnightTurn(band.knight, columns)
    case 'beach':
      return beginBeach(band.beach)
    case 'drive':
      return beginCruise(band.drive)
    case 'meditation':
      return beginMeditation(band.meditation)
  }
}

// The turn is over: a fight wraps up on screen for a moment.
function endTurn($: EngineInterface) {
  if (band.style === 'off' || !isFight(band.scene) || band.mount === undefined) {
    return
  }

  const columns = bandColumns()
  switch (band.scene) {
    case 'shooter':
      endShooterTurn(band.shooter, columns)
      break
    case 'dojo':
      endDojoTurn(band.dojo, columns)
      break
    case 'knight':
      endKnightTurn(band.knight, columns)
      break
  }

  band.isOutro = true
  void update($, isOutro, () => true)
  $.clock.after(OUTRO_MS, () => {
    band.isOutro = false
    void update($, isOutro, () => false)
  })
}

function stopBand() {
  band.timer?.cancel()
  band.timer = undefined
  band.mount = undefined
}

function resetScenes() {
  band.frame = 0
  band.shooter = createShooter()
  band.dojo = createDojo()
  band.knight = createKnight()
  band.beach = createBeach()
  band.drive = createCruise()
  band.meditation = createMeditation()
}

function startBand($: EngineInterface) {
  if (band.timer !== undefined) {
    return
  }

  band.timer = $.clock.every(FRAME_MS, () => {
    if (!band.isWorking && !band.isPreviewing && !band.isOutro) {
      stopBand()

      return
    }

    band.frame += 1

    const mount = band.mount
    if (mount === undefined) {
      return
    }

    const { requestId, columns, rows, isImg, isPicture } = mount
    stepScene(columns)

    const source = isPicture ? framePicture(columns, rows) : undefined
    if (source !== undefined) {
      void $.ui
        .blit({ requestId, key: BAND_KEY, source })
        .then(result => {
          if ('deny' in result && band.mount?.requestId === requestId) {
            band.mount = undefined
          }
        })
        .catch(() => undefined)

      return
    }

    // Pictures move only on a redraw: each frame is one.
    if (isImg) {
      void update($, imgFrame, frame => (frame ?? 0) + 1).catch(() => undefined)

      return
    }

    void $.ui
      .blit({ requestId, key: BAND_KEY, cells: frameCells(columns, rows) })
      .then(result => {
        if ('deny' in result && band.mount?.requestId === requestId) {
          band.mount = undefined
        }
      })
      .catch(() => undefined)
  })
}

async function setStyle($: EngineInterface, next: AnimStyle) {
  band.style = next
  resetScenes()
  await update($, style, () => next)
  await $.store.set(STYLE_STORE_KEY, next)
}

async function preview($: EngineInterface) {
  band.isPreviewing = true
  beginTurn()
  await update($, isPreviewing, () => true)
  startBand($)
  $.clock.after(PREVIEW_MS, () => {
    band.isPreviewing = false
    void update($, isPreviewing, () => false)
  })
}

// Reads a JSON file, if there is one: undefined when not, a note when it
// will not parse.
async function readJson($: EngineInterface, file: string, notes: string[]) {
  try {
    return (await $.fs.exists(file)) ? (JSON.parse(await $.fs.read(file)) as unknown) : undefined
  } catch (error) {
    notes.push(`could not read ${file}: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

// Reads the person's content file, if any, over the built-in content.
async function loadContent($: EngineInterface) {
  const home = (await $.env.get('HOME')) ?? ''
  band.contentFile = `${home}/${CONTENT_PATH}`

  const notes: string[] = []
  const own = await readJson($, band.contentFile, notes)
  band.contentNotes = [...notes, ...applyContent(own)]
}

const contentReport = async ($: EngineInterface) => {
  const exists = await $.fs.exists(band.contentFile).catch(() => false)
  const status = !exists
    ? 'Using the built-in content (no file there yet).'
    : band.contentNotes.length === 0
      ? 'Loaded with no problems.'
      : `Loaded, with ${band.contentNotes.length} problem(s):\n${band.contentNotes.map(note => `  - ${note}`).join('\n')}`

  return [
    `Your content file: ${band.contentFile}`,
    status,
    `Format and examples: ${band.root}/CONTENT.md`,
    'Ask Claude to edit it for you, e.g. "add a rival to my unhinged arcade content", then run /arcade reload.',
  ].join('\n')
}

const pacingReport = () => {
  const [incident, fight, setPiece, full] = band.pacing.map(seconds => `${seconds.toFixed(1)}s`)
  const learned =
    band.turnSeconds.length < 10
      ? `Using the default pacing; it learns from your turns after 10 (${band.turnSeconds.length} so far).`
      : `Fitted to your last ${band.turnSeconds.length} turns.`

  return `Acts: something happens at ${incident}, the fight is on at ${fight}, a set piece at ${setPiece}, everything from ${full}. ${learned}`
}

const USAGE = `${STYLES.join(' | ')} | pictures on|off | pacing | content | reload`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    band.root = $.plugin.root
    const term = (await $.env.get('TERM')) ?? ''
    const ghostty = await $.env.get('GHOSTTY_RESOURCES_DIR')
    band.hasGraphics = term.includes('kitty') || term.includes('ghostty') || ghostty !== undefined

    const savedRaw = await $.store.get(STYLE_STORE_KEY)
    const saved = toStyle(savedRaw)
    if (saved !== undefined) {
      band.style = saved
      await update($, style, () => saved)

      if (saved !== savedRaw) {
        await $.store.set(STYLE_STORE_KEY, saved)
      }
    }

    band.hasPictures = (await $.store.get(PICTURES_STORE_KEY)) !== false

    const turns = await $.store.get(TURNS_STORE_KEY)
    band.turnSeconds = Array.isArray(turns) ? turns.filter((value): value is number => typeof value === 'number') : []
    band.pacing = pacingFor(band.turnSeconds)

    await loadContent($)

    await $.command.register({
      name: 'arcade',
      description: 'Pick the animation above the prompt while Claude works, or manage your content',
      argumentHint: USAGE,
      immediate: true,
    })

    return next(e)
  })

  on('command.run', { command: 'arcade' }, async ($, e) => {
    const [asked = '', option = ''] = e.args.trim().toLowerCase().split(/\s+/)

    if (asked === 'content') {
      return { text: await contentReport($) }
    }

    if (asked === 'reload') {
      await loadContent($)
      resetScenes()

      return { text: await contentReport($) }
    }

    if (asked === 'pacing') {
      return { text: pacingReport() }
    }

    if (asked === 'pictures') {
      const isOn = option === '' ? !band.hasPictures : option === 'on'
      band.hasPictures = isOn
      await $.store.set(PICTURES_STORE_KEY, isOn)

      const note = band.hasGraphics ? '' : ' (this terminal shows no pictures, so the fights stay in pixels here)'

      return { text: `Pictures ${isOn ? 'on' : 'off'}${note}.` }
    }

    const chosenStyle = toStyle(asked)
    if (asked !== '' && chosenStyle === undefined) {
      return { text: `Unknown style "${asked}". Pick one of: ${USAGE}.` }
    }

    const current = STYLES.indexOf(band.style)
    const chosen = chosenStyle ?? STYLES[(current + 1) % STYLES.length] ?? 'fight'

    await setStyle($, chosen)

    if (chosen === 'off') {
      return { text: 'Arcade off. /arcade <style> to bring one back.' }
    }

    await preview($)

    return { text: `Arcade: ${chosen} (saved). Previewing for a few seconds.` }
  })

  on('turn.start', ($, e, next) => {
    if (e.agentId === undefined) {
      band.isWorking = true
      beginTurn()
      const words = SPINNER_WORDS[band.scene]
      band.word = words[Math.floor(Math.random() * words.length)]
      startBand($)
    }

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      band.isWorking = false
      endTurn($)

      // Learn how long turns run, for the acts' pacing.
      band.turnSeconds = remember(band.turnSeconds, e.durationMs / 1000)
      band.pacing = pacingFor(band.turnSeconds)
      await $.store.set(TURNS_STORE_KEY, band.turnSeconds).catch(() => undefined)
    }

    return next(e)
  })

  // The animation strip directly above the prompt box.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, style)
    const previewing = await read($, isPreviewing)
    const outro = await read($, isOutro)
    const isShown = e.props.isWorking || previewing || outro

    if (e.surface !== 'terminal' || !isShown || e.props.hasSurvey || current === 'off') {
      band.mount = undefined

      return next(e)
    }

    if (current !== band.style) {
      band.style = current
      beginTurn()
    }
    band.isWorking = e.props.isWorking

    const { Box, Image, Raster } = $.ui.resolve(e)
    const width = Math.min(512, Math.max(1, e.props.bodyColumns))

    startBand($)

    const actorsOf = band.hasPictures && band.hasGraphics ? sceneActors(band.scene) : undefined
    const isImg = actorsOf !== undefined && e.props.maxRows >= ARENA_ROWS

    if (isImg) {
      await read($, imgFrame)
      band.mount = { requestId: e.requestId, columns: width, rows: ARENA_ROWS, isImg, isPicture: false }

      const pictures = actorsOf(width).map(actor => (
        <Box key={`at-${actor.key}`} position="absolute" top={actor.top} left={actor.left}>
          <Image
            key={actor.key}
            source={{ file: `${band.root}/assets/img/${actor.file}`, format: 'png' as const }}
            columns={actor.columns}
            rows={actor.rows}
            alt=" "
          />
        </Box>
      ))

      return (
        <Box flexDirection="row">
          <Raster key={BAND_KEY} columns={width} rows={ARENA_ROWS} cells={frameCells(width, ARENA_ROWS, false)} />
          {pictures}
        </Box>
      )
    }

    const rows = Math.max(1, Math.min(BAND_ROWS[band.scene], e.props.maxRows))

    // A chill scene, finely drawn, where the terminal shows pictures.
    const pictureColumns = Math.min(255, width)
    const picture = band.hasPictures && band.hasGraphics ? framePicture(pictureColumns, rows) : undefined
    if (picture !== undefined) {
      band.mount = { requestId: e.requestId, columns: pictureColumns, rows, isImg: false, isPicture: true }
      return <Image key={BAND_KEY} source={picture} columns={pictureColumns} rows={rows} alt=" " />
    }

    band.mount = { requestId: e.requestId, columns: width, rows, isImg: false, isPicture: false }

    return <Raster key={BAND_KEY} columns={width} rows={rows} cells={frameCells(width, rows)} />
  })

  on('ui.render', { component: 'Spinner' }, ($, e, next) => {
    if (e.props.message !== null || band.word === undefined) {
      return next(e)
    }

    return next({ ...e, props: { ...e.props, word: band.word } })
  })
}
