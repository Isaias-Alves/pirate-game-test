// Performance + memory profiling for the combat scene. Usage:  npm run profile
//   PROFILE_SECONDS=180 (match length)  PROFILE_HEADED=1 (real GPU window)  PROFILE_URL=http://localhost:4174
// Requires the e2e build to be served (see package.json "profile" script). Writes docs/profiling/results.json.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';

const URL = process.env.PROFILE_URL ?? 'http://localhost:4174';
const SECONDS = Number(process.env.PROFILE_SECONDS ?? 180);
const HEADED = process.env.PROFILE_HEADED === '1';
const VIEWPORT = { width: 1280, height: 720 };

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  headless: !HEADED,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--enable-precise-memory-info', ...(process.env.PROFILE_GPU === '1' ? ['--use-angle=d3d11', '--disable-gpu-sandbox'] : [])],
});
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1, locale: 'en-US' });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('Performance.enable');

async function open(query = '') {
  await page.goto(`${URL}/?scenario=success&latency=0${query}`);
  await page.getByTestId('screen-menu').waitFor();
}
async function startMatch() {
  await page.getByTestId('play').click();
  await page.waitForFunction(() => window.__game !== undefined);
}
async function metrics() {
  await cdp.send('HeapProfiler.collectGarbage');
  await sleep(150);
  const { metrics: m } = await cdp.send('Performance.getMetrics');
  const get = (n) => m.find((x) => x.name === n)?.value ?? 0;
  return { jsHeapMB: +(get('JSHeapUsedSize') / 1048576).toFixed(2), domNodes: get('Nodes'), listeners: get('JSEventListeners'), documents: get('Documents') };
}

// ---------- Environment ----------
await open();
const env = await page.evaluate(() => {
  const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
  const ext = gl?.getExtension('WEBGL_debug_renderer_info');
  return { gpu: ext && gl ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown', dpr: window.devicePixelRatio, userAgent: navigator.userAgent };
});
const cpu = os.cpus()[0];
const environment = {
  os: `${os.type()} ${os.release()} (${os.arch()})`,
  cpu: `${cpu?.model ?? 'unknown'} x${os.cpus().length}`,
  ramGB: +(os.totalmem() / 1073741824).toFixed(1),
  browser: `Chromium ${browser.version()} (${HEADED ? 'headed' : 'headless'})`,
  gpuRenderer: env.gpu,
  viewport: `${VIEWPORT.width}x${VIEWPORT.height} @ DPR ${env.dpr}`,
  build: 'optimized production build (vite build --mode e2e), served by vite preview',
};

// ---------- 1. Frame pacing over a full match ----------
// Default balance (spawn every 3 s, 180 s session). The hull is made durable so the whole match is played;
// a simple input pattern keeps the ship sailing, turning and firing so all systems are exercised.
await page.addInitScript(() => {
  window.localStorage.setItem('pirate-battle:options:v1', JSON.stringify({ sessionSeconds: 180, spawnInterval: 3 }));
});
await open('&gameSeed=11');
await startMatch();
await page.evaluate(() => {
  const g = window.__game;
  g.sim.player.maxHealth = 1e9;
  g.sim.player.health = 1e9;
  window.__frames = [];
  window.__entities = [];
  let last = performance.now();
  const loop = (now) => {
    window.__frames.push(now - last);
    last = now;
    window.__raf = requestAnimationFrame(loop);
  };
  window.__raf = requestAnimationFrame(loop);
  window.__entitySampler = setInterval(() => {
    const { sim } = window.__game;
    window.__entities.push({ enemies: sim.enemies.length, projectiles: sim.projectiles.length, total: 1 + sim.enemies.length + sim.projectiles.length });
  }, 1000);
});

const t0 = Date.now();
const patterns = [['KeyW', 'KeyD', 'Space'], ['KeyW', 'KeyA', 'KeyE'], ['KeyW', 'Space', 'KeyQ'], ['KeyD', 'KeyE'], ['KeyW', 'KeyA', 'Space']];
let i = 0;
while ((Date.now() - t0) / 1000 < SECONDS) {
  const keys = patterns[i++ % patterns.length];
  for (const k of keys) await page.keyboard.down(k);
  await sleep(1800);
  for (const k of keys) await page.keyboard.up(k);
  const phase = await page.evaluate(() => window.__game?.currentPhase);
  if (phase === 'ended') break;
}
const run = await page.evaluate(() => {
  cancelAnimationFrame(window.__raf);
  clearInterval(window.__entitySampler);
  const g = window.__game;
  return { frames: window.__frames.slice(5), entities: window.__entities, simSeconds: g.sim.time, score: g.sim.score, phase: g.currentPhase };
});
const sorted = [...run.frames].sort((a, b) => a - b);
const mean = run.frames.reduce((a, b) => a + b, 0) / run.frames.length;
const entities = run.entities.map((e) => e.total);
const frameStats = {
  wallSeconds: +((Date.now() - t0) / 1000).toFixed(1),
  simSeconds: +run.simSeconds.toFixed(1),
  frames: run.frames.length,
  avgFps: +(1000 / mean).toFixed(1),
  frameMs: { mean: +mean.toFixed(2), p50: +pct(sorted, 50).toFixed(2), p95: +pct(sorted, 95).toFixed(2), p99: +pct(sorted, 99).toFixed(2), max: +sorted[sorted.length - 1].toFixed(2) },
  framesOver20ms: run.frames.filter((f) => f > 20).length,
  framesOver33ms: run.frames.filter((f) => f > 33.4).length,
  entities: { avg: +(entities.reduce((a, b) => a + b, 0) / entities.length).toFixed(1), max: Math.max(...entities), maxEnemies: Math.max(...run.entities.map((e) => e.enemies)), maxProjectiles: Math.max(...run.entities.map((e) => e.projectiles)) },
  endPhase: run.phase,
  score: run.score,
};

// ---------- 2. Memory over 5 start -> play -> leave cycles ----------
await page.addInitScript(() => undefined);
await open('&clock=manual&gameSeed=5');
const cycles = [];
const baseline = await metrics();
const CYCLES = Number(process.env.PROFILE_CYCLES ?? 5);
for (let c = 1; c <= CYCLES; c++) {
  await startMatch();
  await page.evaluate(() => {
    const g = window.__game;
    g.sim.player.maxHealth = 1e9;
    g.sim.player.health = 1e9;
  });
  await page.keyboard.down('KeyW');
  await page.keyboard.down('Space');
  for (let s = 0; s < 6; s++) {
    await page.evaluate(() => window.__game.advance(10));
    await sleep(200);
  }
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyW');
  const during = await metrics();
  await page.keyboard.press('Escape');
  await page.getByTestId('quit').click();
  await page.getByTestId('screen-menu').waitFor();
  const canvases = await page.locator('canvas').count();
  cycles.push({ cycle: c, ...(await metrics()), canvasesAfterLeaving: canvases, heapDuringMatchMB: during.jsHeapMB });
}

const result = { measuredAt: new Date().toISOString(), environment, config: { sessionSeconds: 180, spawnInterval: 3 }, frameStats, memory: { baseline, cycles } };
mkdirSync('docs/profiling', { recursive: true });
writeFileSync(process.env.PROFILE_OUT ?? 'docs/profiling/results.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
await browser.close();
