# Performance report

Measured with `npm run profile` ([scripts/profile.mjs](../scripts/profile.mjs)); raw output in [docs/profiling/](profiling/). The script drives a real match through real keyboard input, samples `requestAnimationFrame` deltas inside the page, and reads heap / DOM / listener counts from Chromium's `Performance.getMetrics` after a forced garbage collection.

## Environment

| | |
| --- | --- |
| OS | Windows 11 (10.0.26200, x64) |
| CPU | Intel Core i5-9400 @ 2.90 GHz, 6 cores |
| RAM | 15.8 GB |
| GPU | NVIDIA GeForce GTX 1650 (Direct3D 11 through ANGLE) |
| Browser | Chromium 153 (Playwright build), headless, hardware GL enabled (`--use-angle=d3d11`) |
| Viewport | 1280×720 at device pixel ratio 1 |
| Build | optimized production bundle (`vite build --mode e2e`), served by `vite preview` |
| Match | 180 s session, enemy spawn every 3 s (defaults otherwise), fixed seed, hull made durable so the whole match is played |
| Input | scripted: sails, turns and fires all cannons in rotating patterns for the full match |

## Frame rate — one full three-minute match

Source: [profiling/results.json](profiling/results.json)

| Metric | Result |
| --- | --- |
| Wall-clock time / simulated time | 181.4 s / 180.0 s |
| Frames sampled | 10 876 |
| **Average FPS** | **60.0** |
| Frame time mean / p50 | 16.67 ms / 16.7 ms |
| **Frame time p95** | **16.7 ms** |
| p99 / max | 16.8 ms / 16.8 ms |
| Frames over 20 ms | 0 |
| Frames over 33 ms | 0 |
| **Entities on screen** (player + enemies + projectiles) | average 9.8, maximum 16 (up to 10 enemies, 6 projectiles) |
| Result of the match | ended by time, 24 ships sunk |

The 60 FPS target is met with the display's refresh rate as the ceiling (every frame lands on the 16.7 ms vsync interval). Because the game is single-scene and the entity count stays small, the workload is far below what the GPU can do; a higher-refresh display would run proportionally faster.

### Software rendering (worst case)

Headless Chromium without a GPU renders WebGL on the CPU (SwiftShader). A 15-second run in that mode ([profiling/results-software-gl-15s.json](profiling/results-software-gl-15s.json)) averaged **30.9 FPS** (p50 33.3 ms, p95 33.5 ms, max 66.7 ms). This is the mode the automated Playwright tests run in; it is why they run with two workers, and it shows the floor on a machine with no usable GPU.

## Memory — five start → play → leave cycles

Each cycle: start a match, play 60 simulated seconds with sailing and firing (fast-forwarded in ten-second slices, letting the renderer draw between them), open the pause menu, choose **Main Menu**. After leaving, garbage is collected and the counters are read.

| Cycle | JS heap after leaving (MB) | DOM nodes | Event listeners | Canvases left |
| --- | ---: | ---: | ---: | ---: |
| baseline (menu) | 6.11 | 373 | 181 | – |
| 1 | 7.36 | 372 | 188 | 0 |
| 2 | 7.55 | 374 | 188 | 0 |
| 3 | 7.72 | 374 | 188 | 0 |
| 4 | 7.92 | 374 | 188 | 0 |
| 5 | 8.01 | 372 | 188 | 0 |

- DOM nodes, event listeners and canvases are **flat** from the first cycle on: the disposal path (ticker callback, window/document listeners, keyboard listeners, resize/pixel-ratio watchers, scene graph, Pixi `Application`) releases what it creates.
- The JS heap rises by about 0.17 MB per cycle in the first cycles. To check whether that is a leak, the same test was run for **25 cycles** ([profiling/results-25-cycles.json](profiling/results-25-cycles.json)): the heap climbs from 7.2 MB to about 8.6 MB by cycle 13 and then **plateaus** (8.5–9.0 MB through cycle 25). The early rise is one-off warm-up — library caches (Pixi, TanStack Query, MSW, the texture cache reused by every match) — not a per-match leak.

## Limitations

- Numbers come from one machine. They are a reference for this hardware, not a guarantee for phones; touch devices were exercised for layout and behaviour in Playwright's mobile emulation, not profiled on a physical device.
- Frame pacing was measured at DPR 1. At higher DPR the renderer caps at 2× (`MAX_RESOLUTION`), which increases fill cost roughly fourfold on a 2× display; the scene is simple, so this is expected to be comfortable on current hardware but was not measured here.
- The simulation is not interpolated between its 60 Hz fixed steps; on displays faster than 60 Hz frames may repeat a state.
- Heap numbers are `JSHeapUsedSize` after a forced collection; GPU memory is not included.

## Reproduce

```bash
npm run profile                                   # builds the e2e bundle, then profiles (software GL by default)
PROFILE_GPU=1 npm run profile                     # request hardware GL (Windows/D3D11), as used for this report
PROFILE_SECONDS=180 PROFILE_CYCLES=5 PROFILE_GPU=1 node scripts/profile.mjs   # explicit settings (needs the e2e build served on :4174)
```

`npm run profile` expects `npm run preview:e2e` to be serving `dist-e2e` on port 4174 (`PROFILE_URL` overrides).
