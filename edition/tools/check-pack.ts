// Checks content/pack.json the way the plugin will load it, so a mistake in
// the pack shows here and not as a missing rival. sync-core.sh runs it.
//
//   npx tsx tools/check-pack.ts
import { readFileSync } from 'node:fs'

import { applyContent } from '../hooks/content'
import { rivals } from '../hooks/rivals'

const pack = JSON.parse(readFileSync(new URL('../content/pack.json', import.meta.url), 'utf8')) as unknown
const notes = applyContent(undefined, pack)

if (notes.length > 0) {
  console.error(`content/pack.json has ${notes.length} problem(s):\n${notes.map(note => `  - ${note}`).join('\n')}`)
  process.exit(1)
}

const cast = rivals().filter(rival => rival.weight > 0)
console.log(`Pack OK: ${cast.length} rivals in the cast (${cast.map(rival => rival.label).join(', ')})`)
