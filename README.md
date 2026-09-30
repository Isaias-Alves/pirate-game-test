# Pirate Battle

A top-down 2D naval shooter for the browser. Sail between islands, sink Chasers and Shooters, and score as many points as you can before the timer runs out or your ship goes down.

Built with **React + TypeScript (strict)** for the UI, **PixiJS** for the game scene, **TanStack Query + Axios** for the ranking and match history, **MSW** for the mock REST API (also in the published build) and **Playwright** for end-to-end and visual-regression tests.

- **Live demo: https://pirate-game-test.vercel.app** (Vercel; the mock API runs there through the MSW service worker)
- Architecture and decisions: [ARCHITECTURE.md](ARCHITECTURE.md)
- Performance and memory report: [docs/PERFORMANCE.md](docs/PERFORMANCE.md)
- Living build log: [PROGRESS.md](PROGRESS.md)

## Setup

Requirements: Node.js `^20.19` or `>=22.12`, npm 10+.

```bash
npm ci
npm run dev
```

No accounts, keys or private services are needed: every "server" call is answered by MSW inside the browser.

### Environment variables

All optional. They only tune network behaviour and are read at build time.

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_API_TIMEOUT_MS` | `4000` | Axios request timeout (above the slowest simulated latency, 3 s) |
| `VITE_API_RETRIES` | `2` | Automatic retries for reads and for match submission (network errors, timeouts and 5xx only; never 4xx) |
| `VITE_API_RETRY_BASE_MS` | `600` | First retry delay; doubles on each attempt |
| `VITE_E2E` | unset | `1` exposes test hooks (`window.__game`, `?clock=manual`, `?gameSeed=`). Set by `--mode e2e`; never enabled in a normal production build |

`.env.e2e` holds the values used by the Playwright build (short timeouts, one retry).

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server (http://localhost:5173) |
| `npm run build` | Type-check and build for production into `dist/` |
| `npm run preview` | Serve the production build locally (http://localhost:4173) |
| `npm run lint` | ESLint (type-aware, strict) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (Vitest): simulation rules, storage, mock API, query guard |
| `npm run test:e2e` | Playwright: builds an e2e bundle, serves it and runs every spec on desktop and mobile Chromium |
| `npm run test:e2e:ui` | Same, in Playwright's UI mode |
| `npm run test:e2e:report` | Opens the last HTML report (traces of failures are inside) |
| `npm run profile` | Frame-time and memory profiling (see [docs/PERFORMANCE.md](docs/PERFORMANCE.md)) |
| `npm run profile:heap` | Heap-snapshot diff across start/play/leave cycles (needs `npm run preview:e2e` running) |

The first Playwright run needs the browser: `npx playwright install chromium`.
On a busy or low-end machine run `PW_SLOW=1 npm run test:e2e` (PowerShell: `$env:PW_SLOW=1; npm run test:e2e`): one worker and 3x longer timeouts. The arena renders with software WebGL in headless Chromium, so a loaded CPU shows up as timeouts rather than real failures.
Visual baselines live in `e2e/__screenshots__/`; refresh them with `npx playwright test e2e/visual.spec.ts --update-snapshots`.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Sail forward | `W` / `↑` | Arrow button (bottom right) |
| Turn left / right | `A` `D` / `←` `→` | Two turn buttons (bottom left) |
| Front cannon (1 shot) | `Space` | Front cannon button |
| Left / right broadside (3 parallel shots) | `Q` / `E` | Side cannon buttons |
| Pause / resume | `Esc` / `P` | Pause button in the HUD |
| Sound on / off | `M` | Speaker button in the HUD (the choice is remembered) |

Everything can be held at the same time (sail, turn and fire). Touch buttons track their own finger, so several can be held together. The game pauses by itself when the window loses focus or the tab is hidden, and resuming always needs a click or key press. **Supported orientation on phones: landscape** (biggest arena); portrait also works, with the same rules and a hint to rotate. Resizing or rotating mid-match only rescales the view.

Keys are only captured while a match is running; menus behave normally. The pause dialog repeats the key list (**Controls**).

## Rules

- A match lasts **60–180 s** of active play (default 120 s) and ends when time runs out or your hull reaches zero.
- Each enemy sunk by your cannons is **1 point**. A Chaser that blows itself up on your ship scores nothing.
- **Chaser**: chases you, hurts you on contact and explodes. **Shooter**: closes to firing range, keeps its distance and fires.
- Islands block ships and cannonballs. Damaged ships change sprite as their health drops.
- Reloading the page or leaving the match abandons it: it is not recorded anywhere.

## Options

Two settings, validated and saved in `localStorage` (they survive a refresh). A match takes a snapshot of them when it starts.

| Option | Limits |
| --- | --- |
| Game session time | whole seconds, **60–180** |
| Enemy spawn time | seconds between spawns, **0.5–10** |

## Gameplay configuration

Every balance value is in [`src/game/gameConfig.ts`](src/game/gameConfig.ts), a single typed object: arena size and islands, session and spawn limits and opening sequence, spawn clearance, health, speeds, turn rates, collision radii, weapon damage / cooldown / projectile speed, lifetime and radius, Shooter range and aim tolerance, AI steering, damage-stage thresholds. Systems never contain literals: changing a number there rebalances the game without touching any rule code. The fixed simulation step is configured there too.

## Ranking, history and the mock API

There is no real backend. `GET /api/ranking`, `GET /api/players/:id/matches` and `POST /api/matches` are answered by **MSW through a service worker**, in development, in tests and in the published build. Confirmed matches and pending submissions are kept in `localStorage`, so they survive refreshes.

- The ranking compares only matches that used the **same settings**. It opens on your current Options; the **Setup** picker above the table browses other setups (Quick, Standard, Marathon, Swarm, Calm). Ordered by score, then a full-time finish over a sinking, then the earlier match, then match id (a total, deterministic order). Other players are deterministic fixtures.
- A finished match is stored locally **before** it is sent. It carries a client-generated `matchId`; the mock server treats it as an idempotency key, so retries, double clicks, timeouts after saving and reloads never create a second record.
- Once recorded, the result screen shows the match position in the ranking for its setup (e.g. `#12 of 35`).
- If sending fails the result screen says so and offers **Try again**; the main menu shows a banner (**Send now**) while anything is unrecorded. You can start another match meanwhile.
- List failures never block the game, the options or a running match.

### Network scenarios

The main menu has a **Network simulation** panel: pick a scenario and it applies to the next request (cached lists are reset so the effect is visible immediately). **Reset mock data** (with confirmation) erases recorded matches and pending results and goes back to the default scenario.

| Scenario | Behaviour |
| --- | --- |
| Success | Short latency, everything works |
| Empty lists | No ranking / history records |
| Many pages | 74 ranking entries and 25 history entries, so paging is exercised |
| Slow network | ~2.5 s per response |
| Variable latency | 0.1–3 s, seeded |
| Out-of-order responses | Each request is faster than the previous one |
| Timeout | No answer at all |
| Connection failure | Requests fail to connect |
| HTTP 4xx / 5xx | Lists 404 and submissions 400 / everything 500 |
| Ranking down / History down | Only that query fails (500) |
| Timeout after saving | The match is stored but the reply never arrives; retry must not duplicate it |
| Recording unavailable | Saving fails (503) until you switch scenario, then retry |
| Flaky recording | Saving fails twice, then works |

Reproduce a run without the UI: `?scenario=submit-timeout&seed=7&latency=0` (`latency=0` removes simulated delay, `seed` fixes the jitter). The choice is persisted like a normal selection.

**How to reproduce the failure cases**

1. *Load failure*: choose "HTTP 5xx" (or "Connection failure", "Timeout"); the Ranking and Match History tabs show an error with **Try again**.
2. *Late reply / recovery without duplicates*: choose "Timeout after saving", finish a match, wait for "Could not record this match", switch to "Success", press **Try again**: one record, no duplicate.
3. *Unavailable at the end of a match*: choose "Recording unavailable", finish a match, reload the page (the menu shows the pending banner), switch to "Success", press **Send now**.

## Testing

- **Unit (Vitest)**: pure simulation (movement, collisions, weapons, projectile lifecycle, enemy AI, spawner, scoring, match end), options validation, mock database, endpoints, stale-response guard.
- **End-to-end (Playwright, Chromium desktop + mobile)**: the twelve required flows — options, asset loading / failure / retry, movement / bounds / islands, weapons / damage / cooldown / score, Chaser / Shooter / spawn interval, ending by time and death and clean restart, pause and focus loss, result and its persistence, abandoning / repeated navigation / touch controls, ranking and history paging with loading / empty / error, recording and recovery of pending matches, and timeouts / duplicates / out-of-order replies. Visual baselines: menu (top and bottom), arena, arena with damaged ships, arena with touch controls, pause, result, options.
- **Report of the last full run**: [docs/test-report/index.html](docs/test-report/index.html) — 184 tests, all passing (92 per project, desktop and mobile Chromium), 2026-09-30. Open it with `npx playwright show-report docs/test-report`; a fresh run writes `playwright-report/` (with traces of any failure).
- **Accessibility**: an axe scan (WCAG 2.1 A/AA) of menu, options, HUD, pause and result on desktop and mobile, plus a measured contrast check for text over sprite art (which axe cannot evaluate).
- Tests drive the game through its real inputs. Instrumentation is limited to a manual simulation clock (`?clock=manual` + `window.__game.advance()`), a seed (`?gameSeed=`) and reading state; one test uses a durable hull only to observe the timer-based ending.

## Deploy

The output of `npm run build` is a static site (`dist/`). For Vercel: import the repository, framework preset "Vite", build command `npm run build`, output directory `dist`. The MSW worker (`mockServiceWorker.js`) is copied from `public/` automatically, so the mock API runs on the published site. Netlify and Cloudflare Pages work the same way. The published build lives at https://pirate-game-test.vercel.app (Vercel defaults: preset Vite, `npm run build`, output `dist`, Node 22.x, no environment variables).

## Credits and licences

- Game art, UI atlas and sounds: the provided challenge asset pack (`assets/`).
- Font **Lilita One** (© 2011 Juan Montoreano), served through `@fontsource/lilita-one`, under the SIL Open Font License 1.1 — see [licenses/OFL-Lilita-One.txt](licenses/OFL-Lilita-One.txt).
- Third-party libraries keep their own licences (React, PixiJS, TanStack Query, Axios, MSW, Playwright, Vite, Vitest).
