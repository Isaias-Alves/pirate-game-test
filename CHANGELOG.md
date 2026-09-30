# Changelog

All notable changes to Pirate Battle. Versions are git tags (`git checkout v1.0.0` restores that exact state).

## [Unreleased]

### Added
- UI-1: fires break out on heavily damaged ships (one flame) and wrecks (two flames), using the pack's `fire_1`/`fire_2` sprites; they flicker on wall time, freeze while paused and stay still with prefers-reduced-motion. New visual baseline `arena-damaged`.
- UI-2: health at a glance: enemy bars are always red, the player's bar is green (red when low), and the HUD shows the hull value (`76 / 100`).

### Changed
- Visual regression tolerance tightened from 3% of the image to 60 pixels: the old budget let a changed HUD value or bar colour pass unnoticed. Baselines regenerated and verified stable over repeated runs.

UI improvement track, built on top of 1.0.0. Every item is checked against [CHALLENGE.md](CHALLENGE.md) before it is built and ships with regression tests; progress is tracked in [CLAUDE.md](CLAUDE.md) ("Melhorias de interface") and [PROGRESS.md](PROGRESS.md).

## [1.0.0] — 2026-09-29

First feature-complete version: every requirement of the challenge is implemented and tested, except the public deploy (phase 15), which needs the owner's hosting account.

### Gameplay
- Top-down naval arena (1280×720 world units) with three islands that block ships and cannonballs.
- Player ship: sail forward, turn both ways, front cannon (1 shot) and port/starboard broadsides (3 parallel shots), each weapon with its own cooldown. Keyboard (WASD/arrows, Space, Q/E, Esc/P) and on-screen touch controls, all usable at the same time.
- Enemies: Chaser (pursues, rams, explodes, no score) and Shooter (closes to range, holds, fires with a clear line of sight). Both steer around islands. Spawns every configured interval at validated points (open water, far from the player); the first two spawns are one of each type.
- Match: 60–180 s of active time, 1 point per enemy sunk by the player, ends by time or death, everything freezes at the end, clean restart. Manual pause plus automatic pause on focus loss / hidden tab; resuming always needs an action and nothing held during the pause carries over.
- Feedback: health bars above every ship, sprite damage stages, muzzle flash, impacts, splashes, explosions, hit tint, camera shake (off with reduced motion).

### Interface
- Main menu (Play, Options, controls legend, Ranking and Match History tabs, last match, network simulation panel), Options (validated, persisted), match screen (HUD, pause dialog), result dialog (score, time, end reason, record status, Play Again, Main Menu).
- Visual identity from the provided UI atlas; Lilita One display font (OFL).
- Accessibility: keyboard-operable menus and tabs, focus management and trapping in dialogs, labelled inputs with announced errors, a screen-reader status region for score/time/state with one polite live region.
- Responsive: desktop, phone landscape (recommended) and portrait; canvas follows its container and device pixel ratio (capped at 2).

### Data
- Typed REST contracts, Axios client, TanStack Query hooks with retries for transient failures, background refresh, cache invalidation and a revision guard against late responses.
- Idempotent match submission keyed by `matchId`, persisted pending queue, retry from the result dialog and the menu, one automatic retry after reload.
- MSW mock API (service worker in dev and in the published build; `msw/node` in unit tests) with 15 selectable scenarios, seeded latency and a reset.

### Quality
- 80 unit tests (Vitest) and 152 end-to-end tests (Playwright, Chromium desktop + mobile landscape, plus a portrait-phone check), visual baselines for menu, arena, arena with touch controls, pause, result and options.
- Performance: 60 FPS average and 16.7 ms p95 frame time over a full 3-minute match (GTX 1650); heap stable across start/play/leave cycles. See [docs/PERFORMANCE.md](docs/PERFORMANCE.md).
- Docs: [README.md](README.md), [ARCHITECTURE.md](ARCHITECTURE.md), [PROGRESS.md](PROGRESS.md).

### Known gaps at 1.0.0
- Not deployed yet; README has no public URL.
- The Playwright HTML report is not yet committed with the deliverable.
- Sound assets are not used; `fire_1`/`fire_2` sprites are loaded but not shown.
