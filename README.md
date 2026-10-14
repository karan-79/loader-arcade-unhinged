# loader-arcade: unhinged edition

A mod for Claude Code that turns the wait while Claude works into a tiny pixel
arcade above the prompt. **Pinch**, a parody crab, takes on parodies of the AI
industry: ClosedAI, GPT-4.5o-MINI-HIGH, Kodex, Gemenai, Meh-ta, Mistrale,
Grokk, DeepSeep, Cursr, Co-Pilout and Perplexed, plus the Hallucinator, the
Token Goblin and friends.

| Style | What happens |
| --- | --- |
| `fight-shooter` | Waves of rivals run in; some hop bullets, some wear helmets, sometimes a swarm. Powerups: spread shot, rapid fire, laser, homing missiles, a tank, a chopper. Bosses walk in, talk too much, and sometimes meet a bazooka. |
| `fight-dojo` | Pinch holds the middle against rivals from both sides: chops, kicks, uppercuts, judo throws, spin kicks. Rage and giant powerups; boss fights. |
| `fight-knight` | One-on-one duels with a different weapon each time. A finishing cut, a beat of stillness, and the rival falls in two. Bosses end in an ultimate. |
| `chill-beach` | A day at the beach: shades under an umbrella, a gull, a sandcastle, a big wave, sunset, a bonfire under the stars. |
| `chill-drive` | A little car takes the scenic route: pulling away, hills and trees, sunset, then night with headlights and street lamps. |
| `chill-meditation` | Pinch sits and breathes. Ripples, fireflies, a soft aura, floating stones, and in the end a golden glow. |
| `fight`, `chill` | A different scene from the theme each turn. `fight` is the default. |

Every turn plays as a little story: Pinch gets ready, something happens, the
fight is on, then a set piece, then everything. The pacing fits itself to how
long your turns run. Everyone talks; the companies say what you'd expect.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install loader-arcade --marketplace <owner>/loader-arcade-unhinged
```

## Use

| Command | Does |
| --- | --- |
| `/arcade <style>` | Switch style (saved), with a few seconds' preview. |
| `/arcade` | Next style. |
| `/arcade off` | No arcade. |
| `/arcade pictures on\|off` | Pictures for the original cast, where the terminal can show them. The company parodies are always pixels. |
| `/arcade pacing` | When each act starts, and whether it has learned from your turns yet. |
| `/arcade content` | Where your content file goes, and whether it loaded. |
| `/arcade reload` | Re-read your content file. |

## Make it yours

The cast and every line are data: the companies live in
[content/pack.json](content/pack.json), the rest in
[content/default.json](content/default.json). Put your own changes in
`~/.claude/loader-arcade/content.json` (see [CONTENT.md](CONTENT.md)); it goes
over both. Bench a company with `{ "rivals": [{ "id": "grokk", "weight": 0 }] }`.

## Develop

This repository is built from the main loader-arcade source. Everything this
edition adds or changes lives in `edition/`; `./sync-core.sh` copies the main
source in and lays `edition/` over it. Edit `edition/`, not the copied files.

## Disclaimer

This is an unofficial, non-commercial parody. It is not affiliated with,
endorsed by, or sponsored by Anthropic PBC or any company it mentions or
mocks. The rivals are original pixel-art caricatures with made-up names, drawn
for commentary and satire. Claude and Claude Code are trademarks of Anthropic
PBC; all other trademarks belong to their owners. If you own one of them and
want your caricature changed, open an issue.

## License

MIT
