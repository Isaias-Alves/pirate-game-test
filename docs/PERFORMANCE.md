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
| Version | 1.1.0 (includes the UI track: sound, fire on damaged ships, outer sea), measured 2026-09-30 |
| Background load | not a quiet machine: a game launcher and a chat app were open, CPU at ~37% before the run |

## Frame rate — one full three-minute match

Source: [profiling/results.json](profiling/results.json)

| Metric | Result |
| --- | --- |
| Wall-clock time / simulated time | 180.0 s / 180.0 s |
| Frames sampled | 10 794 |
| **Average FPS** | **60.0** |
| Frame time mean / p50 | 16.67 ms / 16.7 ms |
| **Frame time p95** | **16.7 ms** |
| p99 / max | 16.8 ms / 33.4 ms |
| Frames over 20 ms | 1 (one missed vsync, at 150.7 s) |
| Frames over 33 ms | 1 (the same frame, 33.4 ms) |
| **Entities on screen** (player + enemies + projectiles) | average 11.0, maximum 18 (up to 11 enemies, 10 projectiles) |
| Result of the match | ended by time, 26 ships sunk |

An earlier run the same afternoon ([profiling/results-previous-run.json](profiling/results-previous-run.json)) had the same average, p50, p95 and p99, plus **one 150 ms frame**; the script now logs when each long frame happens, and the repeat run above did not reproduce it. With other apps competing for the CPU and GPU, a single stall like that is most likely outside the game, but it is reported rather than hidden. The 1.0.0 run on the same machine had no frame over 16.8 ms.

The 60 FPS target is met with the display's refresh rate as the ceiling (every frame lands on the 16.7 ms vsync interval). Because the game is single-scene and the entity count stays small, the workload is far below what the GPU can do; a higher-refresh display would run proportionally faster.

### Stress and high-density checks

Same machine and build, same scripted input, shorter runs.

| Run | Average FPS | p95 frame time | Max frame | Entities (max) | Source |
| --- | ---: | ---: | ---: | --- | --- |
| **Heaviest setting Options allows**: enemy every 0.5 s, 90 s, durable hull so enemies pile up | 60.0 | 16.7 ms | 16.8 ms | 93 (81 enemies, 17 projectiles) | [results-spawn0.5-90s.json](profiling/results-spawn0.5-90s.json) |
| **Device pixel ratio 2** (2560×1440 backing store at 1280×720 CSS), default setup, 60 s | 60.0 | 16.8 ms | 33.3 ms (one frame) | 14 | [results-dpr2-60s.json](profiling/results-dpr2-60s.json) |

Eight times the usual enemy count keeps every frame on the vsync interval: ship-to-ship separation is O(n²) but ~3 000 pair checks per step at 81 enemies are negligible, and the renderer only moves existing sprites. Rendering at twice the density (4× the pixels) does not change frame pacing either.

### Software rendering (worst case)

Headless Chromium without a GPU renders WebGL on the CPU (SwiftShader). A 15-second run in that mode ([profiling/results-software-gl-15s.json](profiling/results-software-gl-15s.json)) averaged **30.9 FPS** (p50 33.3 ms, p95 33.5 ms, max 66.7 ms). This is the mode the automated Playwright tests run in; it is why they run with two workers (one with `PW_SLOW=1`), and it shows the floor on a machine with no usable GPU.

## Memory — five start → play → leave cycles

Each cycle: start a match, play 60 simulated seconds with sailing and firing (fast-forwarded in ten-second slices, letting the renderer draw between them), open the pause menu, choose **Main Menu**. After leaving, garbage is collected and the counters are read.

| Cycle | JS heap after leaving (MB) | DOM nodes | Event listeners | Canvases left |
| --- | ---: | ---: | ---: | ---: |
| baseline (menu) | 6.28 | 425 | 182 | – |
| 1 | 7.57 | 426 | 189 | 0 |
| 2 | 7.78 | 426 | 189 | 0 |
| 3 | 7.97 | 426 | 189 | 0 |
| 4 | 8.18 | 426 | 189 | 0 |
| 5 | 8.30 | 426 | 189 | 0 |

- DOM nodes, event listeners and canvases are **flat** from the first cycle on: the disposal path (ticker callback, window/document listeners, keyboard listeners, resize/pixel-ratio watchers, scene graph, Pixi `Application`) releases what it creates.
- The JS heap rises by about 0.18 MB per cycle in the first cycles (the menu itself has ~50 more DOM nodes than at 1.0.0: setup picker, sound legend row). To check whether that is a leak, the same test was run for **25 cycles** ([profiling/results-25-cycles.json](profiling/results-25-cycles.json)): the heap climbs from 7.4 MB to 8.7 MB by cycle 11 — one-off warm-up of library caches (Pixi, TanStack Query, MSW, the texture cache reused by every match) — and then almost levels off: +0.3 MB over the next 14 cycles (8.73 → 9.03 MB, about 20 KB per match), while DOM nodes (410), listeners (189) and leftover canvases (0) stay exactly flat. The residual slope was investigated with a heap-snapshot diff (next section): it is not game state.

### What the residual growth is — heap-snapshot diff

`npm run profile:heap` ([scripts/heap-diff.mjs](../scripts/heap-diff.mjs)) plays 10 warm-up cycles, takes a heap snapshot, plays 15 more, takes another, and compares object counts and sizes per constructor. Result: [profiling/heap-diff.json](profiling/heap-diff.json).

| Growth over 15 cycles | Size | What it is |
| --- | ---: | --- |
| Compiled code (`code`) | +198 KB | V8 bytecode and optimised code for functions that warm up over time; bounded by the size of the app |
| Strings (78, ~1 KB each, the size of a list response), `NetworkResourcesData`, `MessagePort`, `ReadableStream` | ~+100 KB | Records of the two list requests made each time the menu reopens (33 in total): the counts match the requests, and they are held by the DevTools network capture that the profiler itself attaches and by one MSW message channel per request |
| V8 internals (`WeakArrayList`, object shapes) | ~+35 KB | Engine bookkeeping that grows with compiled code |
| `LayoutShift`, `LargestContentfulPaint`, `InteractionContentfulPaint`, `DOMRectReadOnly` | ~+30 KB | Performance-timeline entries buffered by the browser (buffers are capped) |
| **Game, Pixi, TanStack Query and audio classes** (Sprite, Container, Graphics, Texture, Game, Simulation, Renderer, AudioContext, Query…) | **0** | No count changes at all between cycle 10 and cycle 25 |

So about 27 KB per cycle in this harness comes from the JavaScript engine and the browser, and part of it (the DevTools capture) does not exist for a normal visitor. Nothing that a match creates survives it.

The diff also led to one clean-up that did not change these numbers: Pixi 8 frees a `Graphics` object's own geometry context only on a bare `destroy()`, so the health-bar masks, arena edge and effects are now destroyed with `{ children: true, context: true }` instead of waiting for Pixi's resource collector.

## Limitations

- Numbers come from one machine. They are a reference for this hardware, not a guarantee for phones; touch devices were exercised for layout and behaviour in Playwright's mobile emulation, not profiled on a physical device.
- The main run is at DPR 1; a 60-second run at DPR 2 (the renderer's cap, `MAX_RESOLUTION`) showed the same frame pacing on this GPU. Phones have weaker GPUs and were not profiled on a device.
- The simulation is not interpolated between its 60 Hz fixed steps; on displays faster than 60 Hz frames may repeat a state.
- Heap numbers are `JSHeapUsedSize` after a forced collection; GPU memory is not included.
- The heap keeps a slope of ~20–27 KB per cycle after warm-up. The heap-snapshot diff attributes it to compiled code and browser-held request/performance records, not to objects created by a match; a very long session (hundreds of matches in one tab) was not measured.

## Reproduce

```bash
npm run profile                                   # builds the e2e bundle, then profiles (software GL by default)
PROFILE_GPU=1 npm run profile                     # request hardware GL (Windows/D3D11), as used for this report
PROFILE_SECONDS=180 PROFILE_CYCLES=5 PROFILE_GPU=1 node scripts/profile.mjs   # explicit settings (needs the e2e build served on :4174)
PROFILE_DPR=2 PROFILE_SPAWN=0.5 PROFILE_SECONDS=90 PROFILE_GPU=1 node scripts/profile.mjs  # stress / high-density variants
npm run profile:heap                              # heap-snapshot diff, cycle 10 vs cycle 25 (needs the e2e build served on :4174)
```

`npm run profile` expects `npm run preview:e2e` to be serving `dist-e2e` on port 4174 (`PROFILE_URL` overrides).
