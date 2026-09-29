# PROGRESS.md — living build log

Read CLAUDE.md first (rules, priorities, phase list), then this file for *where I stopped* and *decisions taken*.
Update this file whenever a phase finishes or a non-obvious decision is made. Every phase = one commit.

## How to resume
1. `git log --oneline` + `git status` — last commit message names the last finished phase.
2. `npm run typecheck && npm run lint && npm test` must be green before starting the next phase.
3. Continue with the first unchecked phase in CLAUDE.md "Status atual".

## Decisions
- TypeScript pinned to ~6.0: typescript-eslint does not support 7.x yet.
- Assets stay in `assets/` and are imported via `import.meta.glob(..., { query: '?url' })` so only used files are bundled (no 30 MB dist).
- Ship sprites: bow orientation is an asset property, stored in `src/game/assets.ts` (not balance config).
- Sim is pure TS (no Pixi/DOM), fixed 1/60 s step with accumulator, seeded RNG (mulberry32) → deterministic unit tests (vitest).
- Angle convention in sim: radians, 0 = +x (east), clockwise-positive because y grows downward.
- React reads sim through an external store (`useSyncExternalStore`), published only when a visible value changes — never per frame.

## Layout (target)
- `src/game/config` gameConfig.ts — all balance values
- `src/game/sim/*` — pure rules: world, systems, collision, rng
- `src/game/input/*` — keyboard/touch → InputState
- `src/game/render/*` — Pixi scene that mirrors sim state
- `src/game/Game.ts` — glue: ticker, fixed step, pause, lifecycle, dispose
- `src/ui/*` — React screens/HUD

## Log
- Phase 1 done (e6add04).
- Phase 2 done: `sim/` (Simulation, collision, rng), `Game.ts` (fixed-step accumulator), `Renderer.ts` (letterboxed world), `KeyboardInput` (Space=front, Q/E=sides, WASD/arrows), `assets.ts` loader (rejects on any failure, GameCanvas shows Retry). Ship art faces DOWN; sprite rotation = heading - PI/2 (verified visually). Ship skins: index = stage*6 + colour (1-6 intact, 7-12, 13-18, 19-24 wreck; colours white, black, red, green, blue, yellow). Player = blue, Chaser = black, Shooter = red. `window.__game` exposed in dev or with `VITE_E2E=1` (src/game/testHooks.ts) for Playwright.
- Phase 3 done: Simulation owns `projectiles`, `enemies` (filled in phase 4), `events` queue (`drainEvents()`, consumed by phase 6 effects). Projectiles use a swept segment-vs-circle test (no tunnelling), die on first hit/island/arena exit/expiry. Port = angle - PI/2, starboard = angle + PI/2. Renderer pools projectile sprites. Weapon stats incl. `projectileRadius` live in gameConfig.
- Phase 4 done: `sim/enemyAI.ts` (steer + island avoidance, Chaser contact = damage + self-destruct, no score; Shooter holds at `holdRangeFactor*attackRange`, fires only with clear line + aimed), `sim/spawner.ts` (spawn point search: inside arena, clear of islands/ships, >= `minPlayerDistance` from player; retries next tick if none; `spawn.opening` = chaser, shooter guarantees both types). New Shooter waits a full cooldown before its first shot. Dead enemies are swept each step. `Game.advance(seconds)` steps the sim deterministically (tests/tooling; NOTE the built-in browser pane is "hidden" so rAF does not run there — use `__game.advance()` for browser checks).
- Phase 5 done: `Simulation` has `score`, `status`, `endReason`, `duration` (from config snapshot); `step()` is a no-op after the end. `Game` owns pause (manual via Esc/P or `pause()`, automatic on window blur / tab hidden with `pauseCause: 'focus'`), explicit `resume()` (clears accumulator + held keys; keyboard ignores action keys while paused), `restart(config?, seed?)`, `onMatchEnd(cb)` → `MatchResult` (score, playedSeconds, endReason, settings snapshot, endedAt), and `store: MatchStore` (useSyncExternalStore-compatible, notifies only on visible change). The `MatchResult` is what phases 8 and 10 persist / submit. Built-in browser pane is hidden → game auto-pauses there; use `__game.resume()` / `__game.advance()`.
- Phase 6 done: `render/HealthBar` (frame + masked fill from UI atlas metadata), `render/Effects` (self-destroying effects), `Renderer` now has ShipView (damage stage by `feedback.damageStageThresholds`, hit tint), camera shake on player damage, `handleEvents()` fed from `sim.drainEvents()` in Game. React: `ui/Hud` (health meter via clip-path, time/score counters), `ui/PauseOverlay` (focus moved to Resume, Tab trapped), `ui/LiveStatus` (sr-only score/time/status + ONE polite live region for pause/resume/end/low health/30s/10s), `ui/uiAssets.uiUrl(name)`. `GameCanvas` layout = `.match` grid (HUD row + arena row). Sounds (assets/sounds/*.wav) NOT wired yet — optional polish for the end. Pause button blurs itself so Space (fire) cannot re-trigger it.
- Phase 7 done: `ui/TouchControls` (HoldButton per action → `Game.setControl(action, held)`; presses rejected unless playing), `ui/touchSupport.wantsTouchControls()` (coarse pointer OR `?touch=1`), `ui/touch.css` (clusters in the letterbox margins). Supported mobile orientation: LANDSCAPE recommended (portrait works but shows a hint). Also fixed: Pixi canvas now follows its host via ResizeObserver + `renderer.resize` (resizeTo only reacts to window resize). Playwright can force touch UI with `?touch=1`.
- Phase 8 done: `App` = in-memory screen state (menu | options | match); reload => menu. `storage/` (localStore safe JSON, options + validation + `matchConfig(options)` snapshot, results (last completed match), ids). `MatchResult` now has `matchId` (idempotency key for phase 10). UI: `theme.css` tokens + 9-slice panel/buttons from the UI atlas + Lilita One font (@fontsource, OFL — LICENSE ships in node_modules; mention in README), `screens.css`, `Dialog` (focus trap/restore), `Tabs` (ARIA), screens under `ui/screens/`. `MatchScreen` = old GameCanvas (moved). Pause dialog has Resume/Restart/Main Menu (Main Menu = abandon, never recorded). Result dialog: score, time played, end reason, Play Again (game.restart with fresh options snapshot) / Main Menu. TODO phase 10: replace `ui/board/BoardPanels.tsx` placeholders + add "record status" row (saving/saved/failed + retry) to `ResultPanel`.
- Phase 9 done: `assets.ts` loader now fetches PNGs itself (fetch -> createImageBitmap -> ImageSource) with module-level texture cache (reused by every match; failed loads leave no cache entry so Retry truly refetches — verified by faking one failed fetch). Density picked by `pickDensity(dpr)` (>=1.5 → retina tiles/tilesheet/health-bar art with `source.resolution=2`; ships/effects/cannonball are identical in both dirs). `pixelRatio.ts`: `MAX_RESOLUTION=2`, `watchPixelRatio` re-arms a matchMedia query and MatchScreen updates `renderer.resolution` + resize. Loading UI: `<progress class="loadbar">` + % ; error UI with Retry/Main Menu (`data-testid` load-error / retry). Playwright can force failure via `page.route('**/*.png', r => r.abort())` — no test hook needed. Known limit: texture density is chosen at load time; a later DPR change re-renders at the new resolution but keeps the loaded art.
