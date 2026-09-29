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
