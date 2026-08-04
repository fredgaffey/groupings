# Groupings

A word-grouping puzzle game: sixteen words, four hidden groups of four, four
mistakes allowed. Vanilla HTML/CSS/JS — no build step, no dependencies.

```
cd ~/connections-clone
python3 -m http.server 8000     # then open http://localhost:8000
```

Opening `index.html` directly off disk also works — see *Data loading* below.

## What's here

| File | |
|---|---|
| `index.html` | markup for the board, archive sheet and help sheet |
| `styles.css` | all styling; light and dark via `prefers-color-scheme` |
| `game.js` | game logic, persistence, archive, keyboard handling |
| `puzzles.json` | **the puzzle archive — source of truth** |
| `puzzles.js` | generated mirror of the JSON, for `file://` use |
| `bundle.js` | `node bundle.js` — regenerates `puzzles.js` from the JSON |
| `build.js` | `node build.js` — validates, bundles, stages `dist/` |
| `validate.js` | `node validate.js` — reports on archive health |
| `deploy.sh` | build + deploy to Cloudflare Pages |

## Deploying

```
./deploy.sh              # build, verify the Access gate, deploy
./deploy.sh --check      # verify the gate only, deploy nothing
./deploy.sh --public     # deploy without requiring a gate
```

`build.js` stages `dist/` with only the five runtime files. This matters:
`wrangler pages deploy` does **not** honour `.assetsignore` (that's a Workers
static-assets feature), so pointing it at the repo root publishes `README.md`,
`validate.js` and `bundle.js` as well.

### The gate check

Pages serves the production hostname *and* a permanent per-deployment hash URL
(`<hash>.<project>.pages.dev`) for every deploy you make. These are covered by
**separate** Cloudflare Access configuration, and the hash URLs accumulate — one
per deployment, each serving a complete copy of `puzzles.json` forever.

So `deploy.sh` fails closed. It enumerates the production URL, `/puzzles.json`,
and the newest hash URL, and aborts before uploading if any of them answers with
content instead of an Access challenge. After deploying it re-checks the *new*
hash URL, since a fresh deployment mints a URL that didn't exist at preflight.

Gating requires both halves, and missing the second is the easy mistake:

1. **Zero Trust → Access → Applications** — an application for
   `<project>.pages.dev` (production)
2. **Pages → project → Settings** — enable Access on preview deployments,
   covering the `*.<project>.pages.dev` hash URLs

Use `--public` only when the archive in `puzzles.json` is content you're
entitled to publish openly.

## Gameplay

- Pick four tiles, **Submit** to check them.
- Three-of-four right reports **One away…** without saying which.
- Four mistakes ends the round and walks out the groups you missed, easiest first.
- Solved groups collapse into a colour band, ordered easiest (yellow) to
  trickiest (purple) regardless of the order you found them.
- **Copy results** puts an emoji grid of your guesses on the clipboard.
- Progress per puzzle is kept in `localStorage` under `groupings:v1`, so a
  half-finished puzzle resumes and a finished one reopens fully revealed.
- Keyboard: arrows move, <kbd>Space</kbd>/<kbd>Enter</kbd> on a tile selects,
  <kbd>Enter</kbd> submits, <kbd>Esc</kbd> clears the selection.

## The archive

The archive button (top left) lists every puzzle newest-first with its status —
`New`, `2/4`, `Flawless`, `1 off`, `Missed`. On load the game opens today's
puzzle if one is dated today, otherwise the most recent past one; puzzles dated
in the future stay hidden until their date.

## Data format

`puzzles.json` is a flat array. Each puzzle has an `id`, a `date`, and exactly
four `answers`:

```json
[
    {
        "id": 1,
        "date": "2026-07-20",
        "answers": [
            {
                "level": 0,
                "group": "CONDIMENTS",
                "members": ["KETCHUP", "MUSTARD", "RELISH", "MAYO"]
            }
        ]
    }
]
```

`level` runs 0 (easiest, yellow) to 3 (trickiest, purple) and drives the band
colour. Within a puzzle: ids and dates unique, all four levels present exactly
once, sixteen distinct upper-case words.

This is the same shape the common community Connections datasets use, so a
dump in that format drops straight in — replace `puzzles.json` wholesale.

### Auto-updating

The game fetches the archive live from the upstream project, so new puzzles
appear without redeploying:

```
https://raw.githubusercontent.com/Eyefyre/NYT-Connections-Answers/main/connections.json
```

That host sends `access-control-allow-origin: *`, so the browser can read it
directly. Sources are tried best-first, each falling through to the next:

1. **fresh cache** — fetched within 6h, kept in `localStorage`
2. **upstream** — the live archive (8s timeout)
3. **stale cache** — when the network is down
4. **local `puzzles.json`** — whatever was last committed
5. **bundled copy** — `PUZZLES_EMBEDDED`, for `file://`

The archive sheet shows which source was used and when. Normalization runs
before caching, so the repair work happens once per fetch rather than per load.

Because the data arrives at runtime, the committed `puzzles.json` is now only a
fallback — it does not need refreshing for the game to stay current.

### Data loading

`fetch()` is blocked on `file://` URLs, so the game can't read the JSON when you
just double-click `index.html`. `bundle.js` handles that: it writes the same
array into `puzzles.js` as `PUZZLES_EMBEDDED`, which `game.js` falls back to
when the fetch fails. So after **any** edit to `puzzles.json`:

```
node validate.js && node bundle.js
```

Skip the bundle step and the served version updates while the `file://` version
silently keeps serving stale puzzles.

Tiles shrink their type past 7 and 10 characters; `validate.js` warns above 12,
which is roughly where a word starts to crowd its tile.

A good puzzle leans on words that plausibly belong to two groups — `#4` puts
MARS and VENUS among planets while SATURN and MERCURY are car brands.

## On the puzzle content

The sixteen puzzles shipped here are original, written for this project. The
archive is deliberately not scraped from any commercial puzzle site: the game
*mechanic* isn't protectable, but a publisher's puzzle wordlists and the look of
their site are their copyright. The visual design here is likewise its own thing
rather than a copy of anyone's. The loader will read whatever you put in
`puzzles.json` — sourcing that data is your call.
