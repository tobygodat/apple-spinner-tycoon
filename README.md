# Apple Spinner

How many apples can you spin in your head? An idle clicker built on the meme. Press Focus to imagine apples spinning. Buy more apples, and better ones: Red Delicious, Granny Smith, Gala, and Honeycrisp, up through 24-Karat, Chrome, Holographic, Crystal, Nebula, and The Platonic Apple. Your estimated IQ rises with every apple you can hold in your mind.

## Play

Open `index.html` in a browser. There is no build step, no install, and no network request, so a double-click on the file works.

To serve it on a local network instead, run any static file server from this folder:

```sh
python3 -m http.server 8101
```

## Deploy

Run `npx wrangler deploy` from this folder to publish the game to https://apple-spinner-tycoon.tobygodat.workers.dev as a Cloudflare Worker with static assets. `.assetsignore` keeps `tests/`, this README, and the config out of the upload.

## How it plays

- **Focus.** Each press of the Focus button, each click on the head, and each Space earns spins. Holding a key down counts once.
- **Apples.** There are 13 varieties. Each one spins on its own and earns spins every second. The price of a variety rises 14% with each one you own. Buy 1, 10, 100, or as many as you can afford.
- **Upgrades.** There are 81 upgrades. They multiply one variety, every apple, or each focus. Some add a share of your spins per second to each focus.
- **IQ.** Your score is `round(100 + 15 × log2(1 + Σ owned × tier))`. It moves you through 14 ranks, from Aphantasic to Platonic Mind.
- **Golden apples.** One drifts across the screen every two to five minutes. Catch it for one of two outcomes. Lucky pays `min(15% of your spins, 900 seconds of production) + 13`. Frenzy multiplies all production by 7 for 45 seconds.
- **Store.** Press S or the Store button to open the store panel, and Esc to close it. Click an apple to see its output, payback time, and the upgrade that boosts it. The Best value tag marks the apple with the most output per spin. Press T for stats and the reset button.
- **Saving.** The game saves to `localStorage` every 10 seconds and when you leave the tab. When you come back, it pays for the time you were away, up to 8 hours.

The head pictures at most 64 apples, fewer in a small window. It always shows your highest variety and gives higher tiers more of the space. The caption under the Focus button gives your true count.

## Layout

| Path | What it holds |
| --- | --- |
| `js/data.js` | Varieties, upgrades, and ranks. |
| `js/economy.js` | Pure game rules: prices, production, IQ, golden apples, offline progress, and save parsing. |
| `js/format.js` | Number formatting (`1,234`, `4.78 M`, `41.76 Qa`). |
| `js/art.js` | The store's apple art and upgrade icons as SVG, and the color for each variety. |
| `js/render.js` | The head and the apples on one Canvas 2D element. |
| `js/game.js` | The page: input, store, toasts, saving, and the frame loop. |
| `fonts/` | Inter, bundled so the page makes no network request (SIL Open Font License). |
| `tests/` | Unit tests for the economy, the formatter, sprite selection, and pacing. |
| `tools/balance-sim.js` | The pacing simulation behind the balance test. |

Each apple is a small 3D render on the CPU. A procedural skin is wrapped onto an apple-shaped body and lit, once per rotation frame. Each variety gets 32 frames on a sprite sheet. The sheets bake a few milliseconds at a time between frames, so the page stays responsive while new varieties appear. Materials are keyed by `look.material` in `js/data.js`: matte, gloss, metal, chrome, holo, crystal, nebula, and platonic.

## Test

```sh
node --test tests/
```

To use the debug panel, add `?debug=1` to the URL. It grants spins, grants 25 of each apple, spawns a golden apple, or simulates two hours away. It also exposes `window.__apples` for scripted checks.

## Balance

```sh
node tools/balance-sim.js
```

This plays an idle strategy against the game and against models of Cookie Clicker and AdVenture Capitalist. The strategy buys whatever pays for itself soonest and clicks twice a second. It prints when each tier unlocks and when you own the first one, production over time, and the gaps between purchases. Add `--svg chart.svg` for a time-to-tier chart or `--json out.json` for the raw numbers. To compare a balance change against another version of the game, check that version out and pass its folder:

```sh
git worktree add ../apple-main origin/main
node tools/balance-sim.js --baseline ../apple-main --svg chart.svg
```

The baseline runs as a dashed line on the chart, and a last table gives each tier's time against the baseline. `tests/balance.test.js` fails if a tier drifts outside two thirds to one and a half times the Cookie Clicker time. It also fails if a tier's base cost or output comes within 15% of the matching Cookie Clicker building, or if three tiers in a row are a near-constant multiple of Cookie Clicker's.
