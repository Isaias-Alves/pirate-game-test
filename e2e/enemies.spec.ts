import { advance, advanceUntil, expect, makeDurable, sample, snapshot, startMatch, test, type Snapshot } from './support';
import { gameConfig } from '../src/game/gameConfig';

const dist = (s: Snapshot, e: { x: number; y: number }) => Math.hypot(e.x - s.player.x, e.y - s.player.y);

test.describe('Enemies and spawning', () => {
  test('a new enemy appears every configured interval, Chaser first and Shooter second', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 180, spawnInterval: 2 }, gameSeed: 1 });
    await advance(page, 1.9);
    expect((await snapshot(page)).enemies).toHaveLength(0);
    await advance(page, 0.2);
    let s = await snapshot(page);
    expect(s.enemies.map((e) => e.kind)).toEqual(['chaser']);
    await advance(page, 1.9);
    s = await snapshot(page);
    expect(s.enemies.map((e) => e.kind)).toEqual(['chaser', 'shooter']);
    // One more per interval (enemies that already reached the player are gone, so count what was spawned).
    const spawned = () => page.evaluate(() => window.__game?.sim.spawnedCount);
    expect(await spawned()).toBe(2);
    await advance(page, 2.1);
    expect(await spawned()).toBe(3);
  });

  test('spawn points are on open water, inside the arena and far from the player', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 180, spawnInterval: 0.5 }, gameSeed: 7 });
    await makeDurable(page);
    const seen = new Map<number, Snapshot['enemies'][number]>();
    for (const frame of await sample(page, 20, 0.5)) {
      for (const e of frame.enemies) {
        if (seen.has(e.id)) continue;
        seen.set(e.id, e);
        // Judged right after birth: an enemy moves at most one sample step before we look.
        expect(e.x).toBeGreaterThan(0);
        expect(e.y).toBeGreaterThan(0);
        expect(e.x).toBeLessThan(frame.arena.width);
        expect(e.y).toBeLessThan(frame.arena.height);
        for (const isl of frame.islands) expect(Math.hypot(e.x - isl.x, e.y - isl.y)).toBeGreaterThan(isl.radius + e.radius - 1);
      }
    }
    expect(seen.size).toBeGreaterThan(10);
    const kinds = new Set([...seen.values()].map((e) => e.kind));
    expect(kinds).toEqual(new Set(['chaser', 'shooter']));
  });

  test('a Chaser pursues the player, hurts them once on impact and is destroyed without scoring', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 180, spawnInterval: 10 }, gameSeed: 1 });
    await advance(page, 10.05);
    const born = await snapshot(page);
    const chaser = born.enemies[0];
    expect(chaser?.kind).toBe('chaser');
    const d0 = dist(born, chaser ?? { x: 0, y: 0 });
    await advance(page, 1.5);
    const later = await snapshot(page);
    expect(dist(later, later.enemies[0] ?? { x: 0, y: 0 })).toBeLessThan(d0 - 100); // closing in

    const after = await advanceUntil(page, (s) => s.player.health < s.player.maxHealth, 9, 0.1);
    expect(after.player.health).toBe(gameConfig.player.maxHealth - gameConfig.chaser.contactDamage);
    expect(after.enemies.filter((e) => e.kind === 'chaser')).toHaveLength(0); // exploded on impact
    expect(after.score).toBe(0);
    await advance(page, 2);
    expect((await snapshot(page)).player.health).toBe(after.player.health); // one impact, one hit
  });

  test('a Shooter closes to firing range and shoots at the player without ramming', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 180, spawnInterval: 2 }, gameSeed: 1 });
    await makeDurable(page);
    await advance(page, 4.05); // Chaser at 2 s, Shooter at 4 s
    let s = await snapshot(page);
    const shooter = () => s.enemies.find((e) => e.kind === 'shooter');
    expect(shooter()).toBeDefined();
    const start = dist(s, shooter() ?? { x: 0, y: 0 });
    expect(start).toBeGreaterThanOrEqual(gameConfig.spawn.minPlayerDistance - 1);

    let enemyShots = 0;
    let closest = Infinity;
    for (const frame of await sample(page, 8, 0.1)) {
      s = frame;
      const sh = shooter();
      if (sh) closest = Math.min(closest, dist(frame, sh));
      enemyShots = Math.max(enemyShots, frame.projectiles.filter((p) => p.owner === 'enemy').length);
    }
    expect(closest).toBeLessThan(gameConfig.shooter.attackRange);
    expect(closest).toBeGreaterThan(gameConfig.shooter.radius + gameConfig.player.radius); // keeps its distance
    expect(enemyShots).toBeGreaterThan(0);
    expect(s.player.health).toBeLessThan(s.player.maxHealth); // some shots landed (durable hull keeps the match alive)
  });

  test('enemies never overlap an island', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 180, spawnInterval: 1 }, gameSeed: 3 });
    await makeDurable(page);
    for (const frame of await sample(page, 30, 0.5)) {
      for (const e of frame.enemies) for (const isl of frame.islands) expect(Math.hypot(e.x - isl.x, e.y - isl.y)).toBeGreaterThanOrEqual(isl.radius + e.radius - 2);
    }
  });
});
