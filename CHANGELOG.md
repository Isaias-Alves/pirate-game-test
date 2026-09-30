# Changelog

All notable changes to Pirate Battle. Versions are git tags (`git checkout v1.0.0` restores that exact state).

## [Unreleased]

### Added
- Published at https://pirate-game-test.vercel.app (Vercel). Checked on the live site: the MSW service worker controls the page, lists load, failure scenarios show retries and recover, and a match recorded under "Recording unavailable" is kept, re-sent after a reload and listed once.

## [1.1.0] — 2026-09-30

UI improvement track, built on top of 1.0.0. Every item is checked against [CHALLENGE.md](CHALLENGE.md) before it is built and ships with regression tests; progress is tracked in [CLAUDE.md](CLAUDE.md) ("Melhorias de interface") and [PROGRESS.md](PROGRESS.md).

### Added
- UI-1: fires break out on heavily damaged ships (one flame) and wrecks (two flames), using the pack's `fire_1`/`fire_2` sprites; they flicker on wall time, freeze while paused and stay still with prefers-reduced-motion. New visual baseline `arena-damaged`.
- UI-2: health at a glance: enemy bars are always red, the player's bar is green (red when low), and the HUD shows the hull value (`76 / 100`).
- UI-3: arena framing: the sea continues past the arena (darker) instead of empty bars, and a bright foam line marks the playable edge; slimmer HUD row on short landscape screens (phone HUD 71 px -> 50 px, arena ~7% taller). The HUD is deliberately NOT overlaid on the arena (reference art does), because the challenge requires no cropping of arena or HUD.
- UI-4: sound from the asset pack: cannon fire (front vs broadside), hits, splashes, ramming, explosions, sinking, score, low-hull and 10 s warnings, start/pause/resume/end stings, ocean ambience and a sailing loop that follows the ship speed. HUD speaker button and `M` key toggle sound (remembered across visits; listed in the controls legend). Audio never blocks the game: every failure is silent, loops fade while paused.
- UI-5: ranking **Setup** picker: opens on the player setup, can browse other setups; paging restarts per setup. Each table still compares only matches with identical settings.
- UI-6: the result screen shows the ranking position once the match is recorded (`#12 of 35 for this setup`). `POST /api/matches` replies now include `rank` and `rankedOf` (same on idempotent replays).
- UI-7: lists say when a request is being retried (`Loading the ranking… No answer yet, trying again (attempt 2 of 3).`, and `updating… (retrying)` on background refreshes).
- UI-8: the pause dialog has a collapsible controls reminder (reachable by keyboard; the focus trap now includes `<summary>`), the arena host has an accessible name (`role="img"`, "Battle arena"), a favicon (the player ship), a meta description and theme colour; the portrait "rotate" hint never wraps.

### Changed

- Default request timeout 6 s → 4 s (still above the slowest simulated latency, 3 s), so a dead server is reported sooner.
- `PW_SLOW=1` Playwright mode for busy or low-end machines (1 worker, 3x timeouts).
- Menu visual regression also captures the bottom of the menu (the menu scrolls inside `.scene`, so `fullPage` only covered the first screen).
- HUD heart icon now sits centred beside the health bar (a CSS specificity bug pushed it up and clipped it on short screens).
- Visual regression tolerance tightened from 3% of the image to 60 pixels: the old budget let a changed HUD value or bar colour pass unnoticed. Baselines regenerated and verified stable over repeated runs.

### Quality
- 94 unit tests and 184 end-to-end tests (92 per project), all passing; the HTML report of that full run is committed at [docs/test-report/index.html](docs/test-report/index.html).
- Re-profiled at 1.1.0: 60 FPS average, 16.7 ms p95 over a 3-minute match; memory flat over 5 and 25 start/play/leave cycles. The profiler now logs when each long frame happens.

### Known gaps at 1.1.0
- Not deployed yet; README has no public URL (the owner deploys).

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
