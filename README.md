# loader-arcade-unhinged

A mod for Claude Code that turns the wait while Claude works into a tiny pixel
arcade above the prompt. **Clawd** takes on the AI industry, logos
and all: ClosedAI, Hugging Fake, Kodex, Gemenai, Meh-ta, Mistrale,
Grokk, DeepSeep, Cursr, Co-Pilout, Perplexed and Qwhen, plus the Hallucinator,
the Token Goblin and friends.

| Style | What happens |
| --- | --- |
| `fight-shooter` | Waves of rivals run in; some hop bullets, some wear helmets, sometimes a swarm. Powerups: spread shot, rapid fire, laser, homing missiles, a tank, a chopper. Bosses walk in, talk too much, and sometimes meet a bazooka. |
| `fight-dojo` | Clawd holds the middle against rivals from both sides: chops, kicks, uppercuts, judo throws, spin kicks. Rage and giant powerups; boss fights. |
| `fight-knight` | One-on-one duels with a different weapon each time. A finishing cut, a beat of stillness, and the rival falls in two. Bosses end in an ultimate. |
| `chill-beach` | A day at the beach: shades under a striped umbrella, clouds and a gull, a sandcastle with a flag, a big wave, sunset over the sea, a bonfire under the moon. |
| `chill-drive` | Clawd takes the scenic route: snowy mountains, rolling hills, pines, sunset, then night with headlight beams and street lamps. |
| `chill-meditation` | Clawd sits in a zen garden as the moon rises. Lanterns, ripples in the raked sand, fireflies, floating stones, and in the end a golden flame. |
| `chill-campfire` | A night in the mountains: Clawd by the fire, his knight's helmet, shield and sword by a pine. The fire catches, a marshmallow gets roasted (or not), stars and an owl come out, and he dozes off under shooting stars. |
| `fight`, `chill` | A different scene from the theme each turn. `fight` is the default. |

In kitty and Ghostty the chill scenes are drawn as live pictures, four times
finer than the block characters. Other terminals (Konsole, GNOME Terminal,
iTerm2 and the rest) get them in quadrant blocks, two colours to a cell.

Every turn plays as a little story: Clawd gets ready, something happens, the
fight is on, then a set piece, then everything. The pacing fits itself to how
long your turns run. Everyone talks; the companies say what you'd expect.

## Install

Needs Claude Code 2.1.275 or later. At the prompt of a Claude Code terminal session:

```
/plugin install loader-arcade-unhinged --marketplace karan-79/loader-arcade-unhinged
```

## Use

| Command | Does |
| --- | --- |
| `/arcade <style>` | Switch style (saved), with a few seconds' preview. |
| `/arcade` | Next style. |
| `/arcade off` | No arcade. |
| `/arcade pictures on\|off` | Pictures for Clawd and the whole cast, where the terminal can show them (kitty, Ghostty); pixels elsewhere. |
| `/arcade pacing` | When each act starts, and whether it has learned from your turns yet. |
| `/arcade content` | Where your content file goes, and whether it loaded. |
| `/arcade reload` | Re-read your content file. |

## Make it yours

The cast and every line are data, in
[content/default.json](content/default.json). Put your own changes in
`~/.claude/loader-arcade-unhinged/content.json` (see [CONTENT.md](CONTENT.md)); it goes
over the built-in set. Bench a company with `{ "rivals": [{ "id": "grokk", "weight": 0 }] }`.

## Develop

A plugin of its own, started as a copy of loader-arcade. After changing
`content/default.json` or a sprite, rebuild the generated content and pictures:

```
python3 tools/build-content.py
npx tsx tools/dump-sprites.ts > /tmp/sprites.json
python3 tools/build-assets.py /tmp/sprites.json
```

Checks: `claude plugin validate .` and `claude plugin test .`

## Disclaimer

This is an unofficial, non-commercial parody. It is not affiliated with,
endorsed by, or sponsored by Anthropic PBC or any company it mentions or
mocks. The rivals are our own hand-drawn pixel caricatures with made-up names,
given eyes and legs for commentary and satire; no official logo files are used. Claude and Claude Code are trademarks of Anthropic
PBC; all other trademarks belong to their owners. If you own one of them and
want your caricature changed, open an issue.

## License

MIT
