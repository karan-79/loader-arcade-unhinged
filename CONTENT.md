# Customizing loader-arcade

Everything the arcade is made of (the rivals, and every line anyone says) is
data. The built-in set lives in [`content/default.json`](content/default.json).
You can change any part of it with your own file:

```
~/.claude/loader-arcade/content.json
```

Your file uses the same shape as `content/default.json`, but only needs what
you want to change. Anything you leave out keeps its built-in value. After
editing, run `/arcade reload` (or start a new session), and `/arcade content`
to see whether it loaded and what, if anything, was wrong with it.

The easiest way: ask Claude, for example

> Add a rival called "Yak Shaver" to my loader-arcade content, brown, with a
> taunt about one more thing first.

and point it at this file for the format.

## Rivals

`rivals` is a list. Each entry is matched to a built-in rival by `id`; a new
`id` adds a new rival.

```json
{
  "rivals": [
    {
      "id": "yak-shaver",
      "label": "YAK SHAVER",
      "weight": 2,
      "sprite": [".yyy.", "ykwky", "yyyyy", "y.y.y"],
      "palette": { "y": "#c58b4b", "w": "#ffffff", "k": "#141414" },
      "taunts": ["One more thing first...", "Let me just refactor this."]
    },
    { "id": "hype-bot", "weight": 0 }
  ]
}
```

| Field | What it is |
| --- | --- |
| `id` | Required. Lowercase name; matches a built-in rival to change it, or adds a new one. |
| `label` | Shown in the heads-up line when it's a boss. Up to 20 characters. |
| `weight` | How often it shows up, 0 to 10. `0` benches it. |
| `sprite` | The pixel art: 1 to 7 rows, all the same width, 3 to 9 wide. `.` is see-through; every other character must be a key in `palette`. |
| `palette` | One character to one colour, as `"#rrggbb"`. |
| `taunts` | What it says while running in. Each line up to 60 characters. |

Drawing tips:

- Rivals face left, toward the hero. Give them eyes as a white pixel with a
  dark pupil on its left: `kw`. Use `k` for the pupil: with pictures on, the
  arcade crosses out `k` pixels when the rival gets hit.
- Legs are added for you, under the sprite.
- A rival you add or redraw has no pre-built picture, so with pictures on the fights draw
  it in pixels; everything else about it works the same.

## Lines

`lines` has three groups. A list replaces the built-in list; a single line
replaces a single line.

```json
{
  "lines": {
    "hero": {
      "streak": ["Easy money.", "Next!"],
      "weapon": { "axe": "Axe-ellent." }
    },
    "boss": { "intro": ["{name} demands tribute."] }
  }
}
```

| Group | Lines |
| --- | --- |
| `hero` | `streak` (on a roll), `hurt`, `swarm`, `bossDown`, `reply` (to a boss's speech), `meh` and `fire` (the bazooka scene), `finisher` (the knight's last cut), `parry`, `powerUp`, `ready` (as the fight starts), `spotted` (when something happens), `outro` (as a turn ends); and single lines per `ultimate` (`inferno`, `holy`), `weapon` (`sword`, `axe`, `spear`, `hammer`, `daggers`, `staff`), `dojoPower` (`rage`, `giant`) and shooter `power` (`spread`, `rapid`, `laser`, `missile`, `tank`, `chopper`). |
| `rivals` | `generic` (anyone's taunt), `helmet`, `swarm`, `flee`, `duel` (the knight's opening), `thrown`, `scout` (peeking in, then running). |
| `boss` | `intro` (`{name}` becomes the boss's label), `brag`, `ramble`, `scared`, `down`. |

Lines are drawn in the arcade's top row, so keep them short: up to 60
characters, and shorter reads better.
