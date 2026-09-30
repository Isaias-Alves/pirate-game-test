import { expect, test as base, type Page } from '@playwright/test';

/**
 * Shared helpers. The game is driven through its REAL inputs (keyboard events, touch buttons); the only
 * instrumentation is `?clock=manual` (the wall-clock ticker stops stepping the simulation) plus
 * `window.__game.advance(seconds)` to move the simulation clock by exact amounts, and `?gameSeed=` to make
 * spawns reproducible. State is read back from `window.__game.sim`.
 */

export const test = base.extend<{ errors: string[] }>({
  /** Console errors and uncaught page errors seen during the test. */
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console: ${m.text()}`);
    });
    await use(errors);
  },
});
export { expect };

export interface Options {
  sessionSeconds: number;
  spawnInterval: number;
}

/** Writes options into localStorage before the app loads, only if the player has not saved any yet. */
export async function seedOptions(page: Page, options: Options): Promise<void> {
  await page.addInitScript((o) => {
    if (window.localStorage.getItem('pirate-battle:options:v1') === null) {
      window.localStorage.setItem('pirate-battle:options:v1', JSON.stringify(o));
    }
  }, options);
}

export interface OpenOptions {
  scenario?: string;
  /** Latency multiplier for the mock API. 0 (default) = instant. */
  latency?: number;
  seed?: number;
  gameSeed?: number;
  /** `manual` (default): the test drives the sim clock. `real`: normal ticker. */
  clock?: 'manual' | 'real';
  touch?: boolean;
}

export function urlFor(o: OpenOptions = {}): string {
  const q = new URLSearchParams();
  q.set('scenario', o.scenario ?? 'success');
  q.set('latency', String(o.latency ?? 0));
  q.set('seed', String(o.seed ?? 1));
  q.set('gameSeed', String(o.gameSeed ?? 1));
  if ((o.clock ?? 'manual') === 'manual') q.set('clock', 'manual');
  if (o.touch) q.set('touch', '1');
  return `/?${q.toString()}`;
}

export async function openMenu(page: Page, o: OpenOptions = {}): Promise<void> {
  await page.goto(urlFor(o));
  await expect(page.getByTestId('screen-menu')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Opens the menu and starts a match; resolves once the arena is running. */
export async function startMatch(page: Page, o: OpenOptions & { options?: Options } = {}): Promise<void> {
  if (o.options) await seedOptions(page, o.options);
  await openMenu(page, o);
  await page.getByTestId('play').click();
  await page.waitForFunction(() => window.__game !== undefined);
  await expect(page.getByTestId('screen-match')).toBeVisible();
  await expect.poll(() => phase(page)).toBe('playing');
}

export const phase = (page: Page) => page.evaluate(() => window.__game?.currentPhase ?? 'none');

export const advance = (page: Page, seconds: number) =>
  page.evaluate((s) => {
    window.__game?.advance(s);
  }, seconds);

export interface Snapshot {
  phase: string;
  time: number;
  score: number;
  duration: number;
  status: string;
  player: { x: number; y: number; angle: number; speed: number; health: number; maxHealth: number; alive: boolean; radius: number };
  enemies: { id: number; kind: string; x: number; y: number; angle: number; health: number; radius: number }[];
  projectiles: { owner: string; x: number; y: number; vx: number; vy: number; damage: number }[];
  islands: { x: number; y: number; radius: number }[];
  arena: { width: number; height: number };
  input: Record<string, boolean>;
}

export const snapshot = (page: Page): Promise<Snapshot> =>
  page.evaluate((): Snapshot => {
    const g = window.__game;
    if (!g) throw new Error('game is not running');
    const { sim } = g;
    return {
      phase: g.currentPhase,
      time: sim.time,
      score: sim.score,
      duration: sim.duration,
      status: sim.status,
      player: {
        x: sim.player.x,
        y: sim.player.y,
        angle: sim.player.angle,
        speed: sim.player.speed,
        health: sim.player.health,
        maxHealth: sim.player.maxHealth,
        alive: sim.player.alive,
        radius: sim.player.radius,
      },
      enemies: sim.enemies.map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, angle: e.angle, health: e.health, radius: e.radius })),
      projectiles: sim.projectiles.map((p) => ({ owner: p.owner, x: p.x, y: p.y, vx: p.vx, vy: p.vy, damage: p.damage })),
      islands: sim.islands.map((i) => ({ x: i.x, y: i.y, radius: i.radius })),
      arena: { width: sim.config.arena.width, height: sim.config.arena.height },
      input: { ...g.input },
    };
  });

/** Holds real keys for `seconds` of simulation time. */
export async function hold(page: Page, keys: string[], seconds: number): Promise<void> {
  for (const k of keys) await page.keyboard.down(k);
  await advance(page, seconds);
  for (const k of keys.toReversed()) await page.keyboard.up(k);
}

/** Advances the clock in small steps until `until` is true (or `maxSeconds` pass). Returns the last snapshot. */
export async function advanceUntil(page: Page, until: (s: Snapshot) => boolean, maxSeconds: number, step = 0.25): Promise<Snapshot> {
  let s = await snapshot(page);
  for (let t = 0; t < maxSeconds && !until(s); t += step) {
    await advance(page, step);
    s = await snapshot(page);
  }
  return s;
}

/** Plays a match to its end by doing nothing (the enemies eventually sink the player). */
export async function idleUntilEnd(page: Page, maxSeconds = 200): Promise<Snapshot> {
  return advanceUntil(page, (s) => s.phase === 'ended', maxSeconds, 1);
}

/** Test instrumentation: makes the player durable so a timer-based ending can be observed. */
export const makeDurable = (page: Page) =>
  page.evaluate(() => {
    const g = window.__game;
    if (!g) return;
    g.sim.player.maxHealth = 1e9;
    g.sim.player.health = 1e9;
  });

export const norm = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** Selects a mock-API scenario in the visible selector on the main menu. */
export async function chooseScenario(page: Page, id: string): Promise<void> {
  await page.getByTestId('scenario-select').selectOption(id);
}

/**
 * Advances the sim in `step`-second increments INSIDE the page (one round trip) and returns a snapshot after
 * each increment. Real inputs held by the test stay held. Use for long observations.
 */
export const sample = (page: Page, seconds: number, step: number): Promise<Snapshot[]> =>
  page.evaluate(
    ({ seconds: total, step: dt }): Snapshot[] => {
      const g = window.__game;
      if (!g) throw new Error('game is not running');
      const out: Snapshot[] = [];
      for (let t = 0; t < total - 1e-9 && g.currentPhase === 'playing'; t += dt) {
        g.advance(dt);
        const { sim } = g;
        out.push({
          phase: g.currentPhase,
          time: sim.time,
          score: sim.score,
          duration: sim.duration,
          status: sim.status,
          player: {
            x: sim.player.x,
            y: sim.player.y,
            angle: sim.player.angle,
            speed: sim.player.speed,
            health: sim.player.health,
            maxHealth: sim.player.maxHealth,
            alive: sim.player.alive,
            radius: sim.player.radius,
          },
          enemies: sim.enemies.map((e) => ({ id: e.id, kind: e.kind, x: e.x, y: e.y, angle: e.angle, health: e.health, radius: e.radius })),
          projectiles: sim.projectiles.map((p) => ({ owner: p.owner, x: p.x, y: p.y, vx: p.vx, vy: p.vy, damage: p.damage })),
          islands: sim.islands.map((i) => ({ x: i.x, y: i.y, radius: i.radius })),
          arena: { width: sim.config.arena.width, height: sim.config.arena.height },
          input: { ...g.input },
        });
      }
      return out;
    },
    { seconds, step },
  );

/** Pages forward through a list until the last page, waiting for each page's rows to load. */
export async function goToLastPage(page: Page): Promise<void> {
  const label = page.getByTestId('page-label');
  const read = async () => {
    const m = /Page (\d+) of (\d+)/.exec((await label.textContent()) ?? '');
    return { at: Number(m?.[1] ?? 1), of: Number(m?.[2] ?? 1) };
  };
  for (let { at, of } = await read(); at < of; { at, of } = await read()) {
    await page.getByTestId('next-page').click();
    await expect(label).toContainText(`Page ${String(at + 1)} of`);
    await expect(page.locator('.board__list[aria-busy="false"]')).toBeVisible();
  }
}
