# Architecture

This document explains how the pieces fit together and why. Commands and features are in [README.md](README.md); the step-by-step build log is in [PROGRESS.md](PROGRESS.md).

## Overview

```
src/
  game/                 the game, independent of React
    gameConfig.ts       every balance value, one typed object
    sim/                pure rules: Simulation, collision, enemyAI, spawner, rng (no Pixi, no DOM)
    input/              keyboard -> InputState (touch writes the same object)
    render/             Pixi scene that mirrors the simulation (Renderer, HealthBar, Effects, damage rules)
    audio/              Web Audio sound driven by the same simulation events (soundMap, AudioEngine, GameAudio)
    Game.ts             glue: ticker, fixed-step loop, pause, restart, disposal, MatchStore
    assets.ts           texture manifest + loader/cache
    matchStore.ts       external store the UI subscribes to
  ui/                   React: screens, HUD, dialogs, tabs, touch controls, board tables
  api/                  contracts, Axios client, TanStack Query hooks, submission queue
  mocks/                MSW handlers, in-page mock database, fixtures, scenarios
  storage/              localStorage: options, last result, player id, pending matches
e2e/                    Playwright specs + visual baselines
```

Dependencies point one way: `sim` knows nothing about anything else; `render` and `Game` read the simulation; React only sees the game through `MatchStore` and a handful of methods (`pause`, `resume`, `restart`, `setControl`, `toggleMute`, `onMatchEnd`).

Each frame, `Game.present()` drains the simulation's one-shot events (`shot` with the weapon that fired, `hit`, `splash`, `rammed`, `destroyed`) and hands the same list to the renderer (effects, hit tint, camera shake) and to the audio layer. Both are presentation: they read the simulation and never change it.

## React and PixiJS integration

`MatchScreen` (React) owns the lifetime of one PixiJS `Application` and one `Game`. It creates the app inside an effect, loads textures, builds the `Game`, and disposes everything on unmount. Pixi initialisation and asset loading are asynchronous, so the effect keeps a small `life` object (`cancelled`, `destroyed`) and an idempotent `teardown`. Under **React Strict Mode** the effect runs mount → unmount → mount: the first run is cancelled while still initialising and tears itself down when it resumes, the second builds the real game. Nothing is created twice and nothing is left behind (checked by the "repeated navigation" test and the profiling script: zero canvases after leaving, flat heap).

React never renders per frame. Continuous state (positions, health, cooldowns, projectiles) lives only in the simulation. `Game` publishes a small snapshot — phase, score, whole seconds left, health, end reason, pause cause, mute state — into `MatchStore` every tick, but the store only notifies subscribers when a visible value actually changed (`useSyncExternalStore`). The HUD therefore re-renders about once per second and on score / health changes, not 60 times per second. Screen-reader status follows the same rule: plain text for score and time, one polite live region for transitions (pause, resume, end, low hull, 30 s and 10 s warnings).

The canvas fits its host with a `ResizeObserver` (window resize alone misses layout changes such as the HUD row appearing). The world is authored in arena units (1280×720) and scaled uniformly with letterboxing, so proportions, collision limits and the arena bounds never depend on the screen. Rendering resolution follows `devicePixelRatio` capped at 2, re-armed through a `matchMedia` watcher for zoom or monitor changes; density-specific art (tiles, health-bar frame) is chosen at load time. There is no pointer input on the canvas (controls are keys and DOM buttons), so there is no coordinate mapping to keep in sync.

## Simulation loop

`Simulation.step(dt, input)` advances the rules by a fixed `dt` (1/60 s). `Game` drives it from the Pixi ticker with an accumulator: each frame adds the elapsed wall time (capped at 0.25 s so a stalled tab cannot cause a spiral), then runs as many fixed steps as fit. Movement, damage, cooldowns, spawns and the match clock all run in simulation time, so they are independent of frame rate. Rendering happens once per frame from the current state; effects (muzzle flash, impact, splash, explosion, hit tint, camera shake) run on wall time because they are cosmetic, and freeze while paused.

Order inside a step: player movement and weapons → spawner → enemies (movement, firing, contact) → projectiles (move, resolve, sweep) → sweep destroyed enemies → end-of-match check. Once the match has ended `step` returns immediately: nothing moves, shoots, spawns, takes damage or scores.

The simulation is deterministic given its seed (`mulberry32`) and inputs. That is what makes the unit tests and the seeded Playwright scenarios reproducible. Effects and camera shake use `Math.random` on purpose: they never feed back into the rules.

### Time, pause and restart

- Pause stops stepping (the accumulator is cleared on resume, so no time is "owed"), releases every held key and stops capturing action keys, so nothing pressed during a pause is applied afterwards. Pausing is automatic on `blur` and when the tab is hidden; resuming always needs a click or the pause key.
- `restart(config)` builds a brand-new `Simulation` and `Renderer` (the old scene is destroyed) with a fresh snapshot of the current options. Health, score, timer and entities all start from scratch.
- A match reads its options once, at creation (`matchConfig(options)`); later changes affect only later matches.

## Collisions

Everything is a circle: ships, islands, projectiles. This keeps the maths cheap and predictable.

- **Ship vs arena**: the centre is clamped so the whole circle stays inside.
- **Ship vs island**: the ship is pushed out along the contact normal, so it slides around the shore instead of sticking.
- **Ship vs ship**: overlapping enemies are separated symmetrically; Shooters are also pushed out of the player. This spacing is soft: the arena and island limits are applied again afterwards, so a push from another ship can never leave a ship inside an island or outside the arena. A Chaser that overlaps the player deals its contact damage once and is destroyed on the spot.
- **Projectiles** use a **swept** test (segment from last to new position against each circle, with the projectile radius as padding), so a fast shot cannot tunnel through a ship or island between two steps. A projectile is marked dead on its first hit, so it can damage only once; dead ones are swept out of the array at the end of the step. Player shots only test enemies, enemy shots only the player. Islands and the arena edge remove any projectile; so does expiry.
- A destroyed enemy leaves the world at the end of the step: it can no longer collide, shoot or hurt anyone.

## Enemies and spawning

- **Chaser**: turns toward the player at its turn rate and advances at full speed.
- **Shooter**: advances until it is within `holdRangeFactor × attackRange`, then holds and keeps turning to face the player; it fires only if the player is within range, it is aimed within `aimTolerance`, no island blocks the line, and its cooldown is over. A new Shooter starts with a full cooldown so it cannot fire the instant it appears.
- **Islands**: both types look ahead and steer around any island that blocks the straight line to the target and is nearer than the target.
- **Spawner**: one spawn per configured interval. The type follows the `opening` sequence first (Chaser, then Shooter, so both appear even in a 60 s match), then weighted random. A candidate point must be inside the arena with a clearance, clear of islands and other ships, and at least `minPlayerDistance` (380, larger than the Shooter's range) from the player; up to 30 random points are tried, and if none fits the spawn is retried on the next step instead of being skipped.

## Resource lifecycle

- Textures are fetched with `fetch` + `createImageBitmap` and cached at module level, so a failed load leaves nothing behind (a retry really goes back to the network) and every match reuses the same decoded textures. Assembled texture sets are cached per density so cropped island textures are created once. All-or-nothing: any failing file rejects the load, the UI shows an alert with **Retry**, and combat never starts half-loaded. Progress is reported per file.
- Sprites are pooled or destroyed with their owner: projectile sprites live in a pool that grows on demand and is hidden when unused; enemy views are created when an enemy appears and destroyed when it leaves; effects destroy themselves when they expire. `Renderer.destroy()` destroys the whole scene graph but never the shared textures. Containers holding `Graphics` (health-bar masks, arena edge, effects) are destroyed with `{ children: true, context: true }`: in Pixi 8 a `Graphics` frees its own geometry context only on a bare `destroy()`, so with options it has to be asked explicitly.
- `Game.dispose()` removes the ticker callback, the `blur` / `visibilitychange` listeners and the keyboard listeners, and clears end-of-match listeners. `MatchScreen` also disconnects the `ResizeObserver` and the pixel-ratio watcher and destroys the `Application`.

## Sound

`audio/soundMap.ts` is a pure mapping from a frame's events to sound cues (unit-tested): a 3-shot broadside is one boom, identical cues in a frame collapse, enemy fire is quieter than the player's. `AudioEngine` wraps Web Audio: files are fetched and decoded in the background and cached for the visit; every failure (no Web Audio, blocked autoplay, a file that does not load) is swallowed so sound can never break the game or print console errors. `GameAudio` adds the match-level cues (start, score, low hull, 10-second warning, pause/resume, end) and two loops: ocean ambience, and a sailing loop whose volume follows the ship's speed. Loops fade out while paused and when the match ends. The audio context is created after the Play click (a user gesture), so autoplay policies allow it. Mute (HUD button or `M`, only captured on the match screen) is persisted in `pirate-battle:sound:v1`.

## Local persistence

All in `localStorage`, read defensively (corrupt or missing data falls back to defaults; every access is in try/catch so blocked storage never breaks the game):

| Key | Content |
| --- | --- |
| `pirate-battle:options:v1` | the two options |
| `pirate-battle:last-result:v1` | last completed match (shown on the menu after a refresh) |
| `pirate-battle:player:v1` | generated local player id |
| `pirate-battle:pending:v1` | finished matches not yet confirmed by the server |
| `pirate-battle:mock-db:v1` | the mock server's confirmed records |
| `pirate-battle:mock-settings:v1` | selected network scenario, seed, latency scale |
| `pirate-battle:sound:v1` | sound on/off |

An abandoned match never reaches storage.

## Ranking and history

**Contracts** (`api/contracts.ts`) are shared by the client and the mock: `MatchRecord`, `RankingEntry`, `Page<T>` (with a monotonic `revision`) and `SubmitResponse`. Responses are validated at runtime (`expectPage`): anything of the wrong shape becomes a failed request instead of crashing the UI.

**Queries** (`api/hooks.ts`): `useRanking(settings, page)` and `useHistory(playerId, page)`, keyed by settings/player and page, with `keepPreviousData` so paging does not flash empty, an `AbortSignal` passed to Axios, `staleTime: 0` and `refetchOnMount: 'always'` so a tab is refreshed whenever it is shown again, and retries only for network errors, timeouts and 5xx with exponential backoff (never 4xx). The UI has distinct loading, error (with retry), empty and background-refresh ("updating…", or "showing saved results" if a refresh fails) states.

**Cache and retries**: a page stays cached for 5 minutes after it stops being shown (`gcTime`), so returning to a tab paints the last rows at once while the refetch runs; tabs also refetch when the window regains focus. Requests time out after 4 s (`VITE_API_TIMEOUT_MS`, above the slowest simulated latency); reads and the submission retry twice with exponential backoff (600 ms, then 1.2 s), and while a list is retrying its loading text names the attempt ("trying again (attempt 2 of 3)"). The **Ranking** tab opens on the player's current Options and has a **Setup** picker (current setup plus presets); each setup is its own query key and paging restarts per setup.

**Late responses** cannot overwrite newer data: keys are per page, invalidation cancels older in-flight fetches, and as a last line of defence a custom `structuralSharing` (`newestWins`) keeps the cached data when an incoming page carries an older `revision`. The mock answers reads from the data as it was when the request *arrived* and only then delays the response, which makes "out-of-order" a real stale snapshot rather than a cosmetic delay.

**Submission** (`api/submissions.tsx`): when a match ends it is written to `pending` **first**, then sent with a TanStack `useMutation` (retrying transient failures). The record carries the game's `matchId`; the server uses it as an idempotency key (`201` on creation, `200` with the existing record on replay; both replies carry `rank` and `rankedOf`, the match position among matches with the same settings, shown on the result screen), so a timeout after the server saved, a double click, a reload or a retry can never create a second record. Sending the same id twice at once is collapsed client-side too. On success the record leaves `pending` and both list caches are invalidated. On failure it stays pending: the result dialog shows the reason and **Try again**, the menu shows a banner, and one automatic attempt is made at the next start. Starting another match is never blocked, and no failure here touches the game, the options or a running match.

**Ranking order** is a total, deterministic order among matches with identical settings: score (descending), a full-time finish before a sinking, earlier match first, then `matchId`.

## Mock API (MSW)

Handlers, fixtures and the in-page database (`mocks/`) are the same code in development, in Vitest (`msw/node`) and in the published build (service worker, `public/mockServiceWorker.js`, started before React renders). Handlers run in the page, so they can read `localStorage`; that is how confirmed records and scenarios persist. Scenarios are read on every request, so switching them from the menu takes effect immediately. Latency uses a seeded generator, and `latencyScale` / `?latency=0` removes delay for tests.

## Testing strategy

- **Vitest** covers the rules in isolation because they are pure: movement, bounds, islands, weapons, cooldowns, projectile lifecycle, enemy AI, spawner constraints, scoring, freezing at the end, ship separation against islands, damage-stage rules, sound cue mapping and loop-volume scheduling (with a fake `AudioContext`), options validation, the mock database and the stale-response guard.
- **Playwright** covers behaviour in a real browser against an optimized build made in `--mode e2e`. It presses real keys and touches real buttons. The only instrumentation is a manual simulation clock (the wall-clock ticker stops stepping; `window.__game.advance(s)` moves time by an exact amount), a seed, and reading state back; these hooks exist only in dev and in `--mode e2e` builds. One test makes the hull durable purely to observe the timer ending.
- **Accessibility** (`e2e/a11y.spec.ts`): axe (WCAG 2.1 A/AA) on the menu tabs, options with errors, HUD, pause and result. axe cannot compute contrast over background images, and every panel and button here is sprite art, so for each text element axe leaves undetermined the test hides the text, screenshots what is behind it and checks the WCAG ratio against the median background pixel. This found the gold buttons at 4.2:1 on short screens; their text colour is now `--ink-deep` (~4.9:1).
- Failures the suite found and that were fixed are listed in [PROGRESS.md](PROGRESS.md) (phase 13).

## Balance decisions and limitations

- The player is faster than everything else (180 vs 130 Chaser, 90 Shooter) and out-turns both, so kiting is always possible; the challenge comes from volume, not speed. A Chaser (40 HP) dies to two front hits; a Shooter (60 HP) to three (a full broadside deals 30 if every shot lands). Front fire is precise and fast (0.35 s), broadsides hit harder as a group but reload in 1.1 s and need positioning.
- Damage: contact 25, Shooter bullets 10 every 1.6 s, against 100 hull points. A Shooter aims at where the player is, not where they will be, so sailing across its line of fire dodges most shots.
- Spawn distance (380) exceeds the Shooter's firing range (320), and a new Shooter waits a full reload, so no spawn can hurt the player before they can react.
- Circles approximate islands; the art is slightly larger than the collision radius so shores never look clipped.
- The simulation is not interpolated between fixed steps: at refresh rates above 60 Hz motion is still smooth because the step is small, but frames may repeat the same state. Interpolation is the obvious next step if a high-refresh display shows judder.
- Density-specific textures are picked when assets load; a later devicePixelRatio change re-renders at the new resolution but keeps the loaded art.
- Baseline screenshots were generated on Windows with Chromium; regenerate them on another platform.
