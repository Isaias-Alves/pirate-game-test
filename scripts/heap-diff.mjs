// Heap-snapshot diff across start -> play -> leave cycles: which object kinds keep growing after warm-up?
// Usage: npm run profile:heap   (HEAP_WARMUP=10 HEAP_CYCLES=15 PROFILE_GPU=1 PROFILE_URL=http://localhost:4174)
// Requires the e2e build to be served on :4174 (npm run preview:e2e). Writes docs/profiling/heap-diff.json.
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';

const URL = process.env.PROFILE_URL ?? 'http://localhost:4174';
const WARMUP = Number(process.env.HEAP_WARMUP ?? 10);
const CYCLES = Number(process.env.HEAP_CYCLES ?? 15);
// Classes owned by the game, Pixi, TanStack Query or the audio layer: none of these may grow between snapshots.
const APP = /Sprite|Container|Graphics|Texture|Game|Simulation|Renderer|Audio|Ticker|Application|HealthBar|Effects|ShipView|ObservablePoint|Bounds|Query|Mutation|Axios/;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({
  args: ['--ignore-gpu-blocklist', '--enable-precise-memory-info', ...(process.env.PROFILE_GPU === '1' ? ['--use-angle=d3d11', '--disable-gpu-sandbox'] : [])],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await page.goto(`${URL}/?scenario=success&latency=0&clock=manual&gameSeed=5`);
await page.getByTestId('screen-menu').waitFor();

/** Same cycle as scripts/profile.mjs: play 60 simulated seconds while sailing and firing, then leave via the pause menu. */
async function cycle() {
  await page.getByTestId('play').click();
  await page.waitForFunction(() => window.__game !== undefined);
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
  await page.keyboard.press('Escape');
  await page.getByTestId('quit').click();
  await page.getByTestId('screen-menu').waitFor();
}

/** Takes a heap snapshot after forced GC and totals self size / count per (node type, constructor name). */
async function snapshot() {
  for (let i = 0; i < 2; i++) {
    await cdp.send('HeapProfiler.collectGarbage');
    await sleep(300);
  }
  const chunks = [];
  const onChunk = (e) => chunks.push(e.chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk', onChunk);
  await cdp.send('HeapProfiler.takeHeapSnapshot', { reportProgress: false });
  cdp.off('HeapProfiler.addHeapSnapshotChunk', onChunk);
  const { snapshot: meta, nodes, strings } = JSON.parse(chunks.join(''));
  const fields = meta.meta.node_fields;
  const types = meta.meta.node_types[0];
  const [iType, iName, iSize] = ['type', 'name', 'self_size'].map((f) => fields.indexOf(f));
  const groups = new Map();
  let total = 0;
  for (let i = 0; i < nodes.length; i += fields.length) {
    const type = types[nodes[i + iType]];
    const name = type.includes('string') ? '(string)' : type === 'code' ? '(code)' : strings[nodes[i + iName]].slice(0, 70);
    const key = `${type} | ${name}`;
    const g = groups.get(key) ?? { count: 0, size: 0 };
    g.count += 1;
    g.size += nodes[i + iSize];
    total += nodes[i + iSize];
    groups.set(key, g);
  }
  return { groups, total };
}

for (let c = 0; c < WARMUP; c++) await cycle();
const before = await snapshot();
for (let c = 0; c < CYCLES; c++) await cycle();
const after = await snapshot();
await browser.close();

const rows = [...new Set([...before.groups.keys(), ...after.groups.keys()])].map((key) => {
  const a = before.groups.get(key) ?? { count: 0, size: 0 };
  const b = after.groups.get(key) ?? { count: 0, size: 0 };
  return { key, countDelta: b.count - a.count, sizeDeltaKB: +((b.size - a.size) / 1024).toFixed(1), countNow: b.count };
});
const result = {
  measuredAt: new Date().toISOString(),
  cycles: { warmup: WARMUP, measured: CYCLES },
  totalMB: { before: +(before.total / 1048576).toFixed(2), after: +(after.total / 1048576).toFixed(2) },
  growthPerCycleKB: +((after.total - before.total) / 1024 / CYCLES).toFixed(1),
  topBySize: rows.sort((x, y) => y.sizeDeltaKB - x.sizeDeltaKB).slice(0, 25),
  topByCount: [...rows].sort((x, y) => y.countDelta - x.countDelta).slice(0, 15),
  // Browser-native nodes are excluded: Blink names such as MediaQuery or PostMessageTaskContainer would match the pattern.
  appClassesChanged: rows.filter((r) => r.countDelta !== 0 && !r.key.startsWith('native') && APP.test(r.key)),
};
writeFileSync(process.env.HEAP_OUT ?? 'docs/profiling/heap-diff.json', JSON.stringify(result, null, 2));
console.log(`heap ${result.totalMB.before} -> ${result.totalMB.after} MB, ${result.growthPerCycleKB} KB per cycle`);
for (const r of result.topBySize.slice(0, 10)) console.log(`${String(r.sizeDeltaKB).padStart(8)} KB ${String(r.countDelta).padStart(6)} objs  ${r.key}`);
console.log('app classes with a count change:', result.appClassesChanged.length ? result.appClassesChanged : 'none');
