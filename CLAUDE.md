# CLAUDE.md — Pirate Battle (Jungle Gaming technical test)

## What this is

A top-down 2D naval shooter built for a job-interview technical test. Deadline: **2 days from the e-mail** (received 2026-09-29 at 15:43 BRT → due 2026-10-01 at 15:43 BRT). The delivered repository must include a public deploy URL. This file exists so that any new Claude Code session picks up the full context quickly, without re-reading the whole challenge.

The original challenge brief is in `CHALLENGE.md` in this repository (copied from https://github.com/junglegaming/game-developer-challenge; it is kept in its original Portuguese). **Read that file for the exact requirements before implementing any feature** — this CLAUDE.md only summarises and prioritises; CHALLENGE.md is the source of truth.

The assets (ships, tiles, UI spritesheets, sounds) come from the challenge repository's `assets/` folder and are already copied here — do not recreate any of them.

## Non-negotiable constraints

- **Language**: all UI text, code identifiers, comments and solution documentation (README.md, ARCHITECTURE.md, this file) must be in **English**. This is a requirement of the brief, not of this file.
- **The stack is fixed**: React + TypeScript (strict mode) for UI/menus, PixiJS for game rendering, TanStack Query + Axios for ranking/history, MSW to mock those two REST APIs, Playwright for E2E + visual regression. Do not swap any of them.
- **Everything else is free** (bundler, styling, state strategy inside the simulation).
- The game is single-player and runs entirely in the browser. Only ranking and match history touch a "backend" (mocked with MSW).
- **Deploy is mandatory** (Vercel preferred). The published build must really run the MSW mocks — i.e. service-worker mode, not only `setupServer` for tests.

## Priority order (by grading weight — do not reorder without a reason)

| Area                                                      | Points | Notes                                                                                                                        |
| --------------------------------------------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------- |
| Gameplay, rules, collisions, enemy behaviour              |     35 | Largest single block. Get it solid before polishing anything else.                                                           |
| PixiJS architecture and resource lifecycle                |     20 | Sim/render/input separation, delta-time simulation, no React re-render per frame, correct cleanup including Strict Mode.     |
| Interface, feedback, responsiveness, accessibility        |     15 | Menus, HUD, options, touch controls, keyboard navigation, contrast.                                                          |
| TanStack Query + Axios + ranking/history consistency      |     10 | Pending-record recovery, no duplicate submission, protection against stale responses.                                        |
| MSW and failure scenarios                                 |      5 | Selectable/reproducible scenarios that must work in the production build.                                                    |
| Playwright tests                                          |     10 | 12 mandatory flows (list below), Chromium desktop + mobile, visual regression baselines.                                     |
| Performance and documentation                             |      5 | FPS / p95 frame time / entity count over a 3-minute match, memory after 5 cycles, ARCHITECTURE.md.                           |

**If time gets tight, cut from the bottom of this table up, never from the top down.** Flawless combat with thin documentation is worth more than mediocre combat with perfect documentation.

## Suggested build order (phases — adjust as work progresses, keep this list up to date)

1. **Scaffold**: Vite + React + strict TS + PixiJS attached to a canvas component. Central, typed `gameConfig` (duration, spawn interval/distribution, health, movement/turn speed, damage, projectile range/speed/lifetime, cooldowns, Shooter range). No balance value hard-coded outside that config.
2. **Simulation loop**: delta-time ticker separate from React rendering; arena bounds; at least one island as a static obstacle; player ship movement and rotation (keyboard first).
3. **Combat**: front shot (1) + side volley (3, left/right); per-weapon cooldown; projectile lifecycle (damage once, removed on hitting a target / expiring / leaving the arena / hitting an obstacle).
4. **Enemies**: Chaser (chases, contact damage, self-destructs on impact, no score) and Shooter (approaches, fires within range) — both need movement, rotation, taking damage, island collisions. Spawner: configured intervals, spawn points validated as obstacle-free and away from the player.
5. **Match cycle**: health, score (1 pt per enemy killed by the player, a Chaser self-destruct does not score), timer (60–180 s configurable), end by death or time, restart = entities/health/score/timer from scratch. Manual pause + automatic pause on focus loss / hidden tab, with no input or movement accumulated during the pause.
6. **HUD and feedback**: health bars over the ships, score/time in the HUD, firing/explosion effects, ship damage visuals by health % (texture swap/tint). Noticeable attack/impact/damage feedback, and a semantic/accessible interface for score/time/state (no per-frame announcements).
7. **Touch controls**: mirroring the keyboard (move/turn/front fire/left/right), moving and firing at the same time.
8. **Screens**: Main menu (Play/Options, Ranking tab, Match History tab, controls legend), Options (session time + spawn interval, validated, persisted in localStorage, applied as a snapshot when a match starts), Result (score, time played, end reason, record status, Play Again/Main Menu). Reloading or leaving the combat screen ends the match; an abandoned match is not recorded.
9. **Resize/DPR**: the canvas fits the screen and pixel density, preserving aspect ratio, input coordinates and arena bounds; asset loading progress/state, with failure handling before combat.
10. **Ranking/history data layer**: typed contracts, Axios client, MSW handlers and fixtures shared between dev/test/demo, TanStack Query hooks (paginated listing, match submission). Idempotent submission (safe retry, no duplicates), pending record persisted across refresh/failure, protection against a late response overwriting newer data, ranking tie-break for the same config.
11. **MSW scenario controls**: a visible selector (success/empty/paginated/slow/variable latency/out of order/timeout/4xx/5xx/timeout after submit with recovery/history down at match end) + a reset-to-initial-state button. Must work in the production build (MSW worker, not just a node server).
12. **Cleanup**: Strict Mode safety (double invoke), releasing ticker/listeners/textures on unmount/restart, memory-leak check over 5 game cycles.
13. **Playwright**: the 12 flows below, Chromium desktop + mobile, seeded scenarios and a controllable simulation clock, isolated state per test, visual regression baselines (menu, arena in a stable state, result screen), HTML report + failure traces.
14. **Docs and profiling**: README.md (setup, environment variables, controls, gameplay configuration, scenario selection/reset, dev/build/preview/lint/typecheck/test commands, how to reproduce failures), ARCHITECTURE.md (React/PixiJS integration, simulation loop, collisions, resource management, local persistence, ranking/history integration including contracts/cache/pending recovery, limitations and balance decisions), performance report (hardware/browser/resolution/config, FPS, p95 frame time, entity count, memory over 5 cycles).
15. **Deploy** — do it early (ideally end of day 1) with an initial build, and redeploy as features land, so there is never a last-minute rush.

## Mandatory Playwright coverage (do not deliver without these 12)

1. Options navigation, validation and persistence.
2. Asset loading, failure, retry.
3. Match start, movement, rotation, arena bounds, island collision.
4. Front and side fire, damage, cooldown, no duplicate scoring.
5. Chaser and Shooter behaviour + spawn interval.
6. End by time and by death; the simulation stops correctly; clean restart.
7. Pause, focus loss, resume without the timer/state advancing improperly.
8. Result screen display + persistence after refresh.
9. Match abandonment, repeated navigation between screens, touch controls.
10. Ranking/Match History query and paging including loading/empty/error.
11. Match submission, both tabs updated, pending submission recovered after refresh.
12. Resubmission after timeout without duplicates; late responses do not overwrite newer data.

## Architecture rules to hold myself to in every phase

- Continuous combat state lives in the simulation/Pixi layer, not in React state. React reads it through a subscription/selector, not by re-rendering every tick.
- The game rules (movement, combat, collisions, enemy behaviour) are implemented by us — no off-the-shelf game-logic library.
- Every balance value comes from the typed config — changing a number must never require touching system logic.
- Every entity/projectile created needs a matching destruction path.
- Ranking/history API failures must never block the game or the options, or interrupt combat.

## Commands (filled in at scaffold time, keep up to date)

```bash
npm run dev           # local dev server
npm run build         # production build
npm run preview       # preview the production build
npm run lint          # eslint
npm run typecheck     # tsc --noEmit
npm test              # vitest (pure unit tests)
npm run test:e2e      # build:e2e + playwright (PW_SLOW=1 on a busy machine: 1 worker, 3x timeouts)
npm run test:e2e:ui   # same, Playwright UI mode
npm run profile       # frame-time + memory profiling (PROFILE_GPU, PROFILE_DPR, PROFILE_SPAWN, ...)
npm run profile:heap  # heap-snapshot diff across cycles (needs npm run preview:e2e running)
```

## Current status

_Update this section at the end of each session so the next one knows where things stand._

- [x] Phase 1 — scaffold (Vite 8 + React 19 + TS 6 strict + Pixi 8; `gameConfig` in `src/game/gameConfig.ts`; `GameCanvas` is Strict Mode safe; typecheck + lint + build pass)
- [x] Phase 2 — simulation loop (fixed-step `Simulation`, `Game` glue, `Renderer`, keyboard; vitest unit tests; verified in browser)
- [x] Phase 3 — combat (front + 3-shot broadsides, per-weapon cooldowns, projectile lifecycle, swept hit test; 17 unit tests)
- [x] Phase 4 — enemies + spawner (Chaser, Shooter, island steering, validated spawn points, opening sequence; 29 unit tests)
- [x] Phase 5 — match cycle (score, timer, end by time/death, freeze after end, pause manual+auto with explicit resume, restart, MatchStore; 38 unit tests + browser check)
- [x] Phase 6 — HUD + feedback (Pixi health bars, damage sprite stages, muzzle/impact/splash/explosion effects, camera shake, React HUD via MatchStore, pause overlay, sr-only live status; verified in browser)
- [x] Phase 7 — touch controls (pointer-capture hold buttons: turn L/R, forward, 3 cannons; simultaneous multi-touch; shown on coarse pointer or ?touch=1; verified in browser at 812x375)
- [x] Phase 8 — screens (menu with Ranking + History tabs, options with validation + persistence, match screen with pause/restart/quit dialog, result dialog, last-match card; verified in browser)
- [x] Phase 9 — resize/DPR + asset-loading UX (ResizeObserver + letterbox, DPR capped at 2 + live DPR watch, retina tiles/HUD art at DPR >= 1.5, hand-rolled texture loader with progress bar, error + retry verified)
- [x] Phase 10 — ranking/history data layer (typed contracts, Axios client, shared MSW handlers + MockDb + fixtures, TanStack hooks with revision guard, idempotent submit + persisted pending queue + retry; verified in browser incl. timeout-after-commit and reload recovery)
- [x] Phase 11 — MSW scenario controls (visible select of 15 scenarios + instant-latency toggle + confirmed reset; verified in dev and in the production build via vite preview)
- [x] Phase 12 — cleanup / Strict Mode pass (disposal audit; texture sets cached per density; 10 Play→Menu cycles + 20 restarts checked in browser: 0 leftover canvases, no errors, heap flat)
- [x] Phase 13 — Playwright suite (all 12 mandatory flows on chromium-desktop + chromium-mobile, visual regression baselines, HTML report + traces on failure; now 192 tests including the accessibility spec)
- [x] Phase 14 — docs + profiling (README, ARCHITECTURE, docs/PERFORMANCE.md: 60 FPS avg, p95 16.7 ms over a 3-min match on a GTX 1650; stress and DPR 2 runs; heap-snapshot diff; licenses/)
- [x] Phase 15 — deploy: https://pirate-game-test.vercel.app (done by the owner on 2026-09-30; Vercel with the Vite preset, no environment variables. Verified: MSW worker controls the page, ranking loads, 5xx/timeout scenarios with visible retries and recovery, a full match under "Recording unavailable" → pending saved → reload → automatic re-send → 1 history record, no duplicate; no JS errors. Every push to `main` redeploys; the live bundle hashes were checked against a local build of `main`.)

## Current version

**v1.1.2** (git tag `v1.1.2`, 2026-09-30). History: `v1.0.0` (all challenge features, 2026-09-29) → `v1.1.0` (UI improvements UI-1…UI-8, re-profiling) → `v1.1.1` (compliance audit fixes: ship separation vs islands, heap-snapshot diff, accessibility spec, darker gold-button text) → `v1.1.2` (audio loop scheduling, stress/DPR 2 profiling, documentation pass, English CLAUDE.md, final test report). Details in `CHANGELOG.md`; the session-by-session log is in `PROGRESS.md`.

## UI improvements (after v1.0.0)

One at a time, each with its own commit and regression tests (lint + typecheck + unit + affected e2e specs + visual regression; full suite at checkpoints). Before each one, check it against `CHALLENGE.md`.

- [x] UI-1 — fire on damaged ships (`fire_1`/`fire_2` sprites, already loaded and unused). Brief: reinforces "visual deterioration of ships according to remaining health"; kept small so it does not hurt "arena readability".
- [x] UI-2 — health legibility: enemy bars red, player bar green (amber/red when low) and "76 / 100" in the HUD. Brief: "show health above the player's ship and each enemy" still met.
- [x] UI-3 — arena framing: fill the letterbox bars with darkened sea + a bright boundary line, and a more compact HUD on short screens. Do **not** overlay the HUD on the arena like the reference image: the brief requires "no cropping of the arena or the HUD".
- [x] UI-4 — sound (assets/sounds) + persisted mute button, pausing with the game and starting only after a user gesture. Brief: allowed ("complementary resources"); console free of errors (autoplay).
- [x] UI-5 — ranking: setup selector (default = current options). Brief: still compares only matches with the same configuration.
- [x] UI-6 — result: show the ranking position once the match is recorded. Brief: the result still has score, time, reason, record status and both actions.
- [x] UI-7 — network feedback in lists: show retry attempts and a shorter default timeout. Brief: "handle loading, empty, error, background refresh… and retries".
- [x] UI-8 — polish: controls reminder in the pause dialog, favicon, accessible label on the canvas, non-wrapping "rotate your device" hint. Brief: "present the controls in the interface".

## Deadline

Due **2026-10-01, 15:43 BRT**. Plan: finish the core (phases 1–9) by the end of day 1; ranking/history + tests (10–13) on the morning/afternoon of day 2; docs, profiling and the final deploy check (14–15) on the evening of day 2, leaving the delivery-day morning for final checks only — nothing new started that close to the deadline.
