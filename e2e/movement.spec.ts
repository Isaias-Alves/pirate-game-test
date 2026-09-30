import { advance, expect, hold, norm, snapshot, startMatch, test } from './support';

// Only one enemy could appear before 10 s, so the first seconds of a match are quiet: spawn interval = max.
const QUIET = { sessionSeconds: 180, spawnInterval: 10 } as const;

test.describe('Player movement', () => {
  test('sails forward along its heading, keeps drifting briefly, then stops', async ({ page, errors }) => {
    await startMatch(page, { options: QUIET });
    const start = await snapshot(page);
    expect(start.player.angle).toBeCloseTo(-Math.PI / 2, 5); // facing north

    await hold(page, ['KeyW'], 1);
    const moving = await snapshot(page);
    expect(moving.player.y).toBeLessThan(start.player.y - 60);
    expect(moving.player.x).toBeCloseTo(start.player.x, 3);

    await advance(page, 4);
    const settled = await snapshot(page);
    expect(settled.player.speed).toBeLessThan(1);
    expect(errors).toEqual([]);
  });

  test('arrow keys work like WASD', async ({ page }) => {
    await startMatch(page, { options: QUIET });
    const start = await snapshot(page);
    await hold(page, ['ArrowUp', 'ArrowRight'], 0.5);
    const s = await snapshot(page);
    expect(s.player.y).toBeLessThan(start.player.y);
    expect(s.player.angle).toBeGreaterThan(start.player.angle);
  });

  test('rotates to both sides, also while stationary', async ({ page }) => {
    await startMatch(page, { options: QUIET });
    const start = await snapshot(page);
    await hold(page, ['KeyD'], 0.5);
    const right = await snapshot(page);
    expect(norm(right.player.angle - start.player.angle)).toBeGreaterThan(0.9);
    expect(right.player.x).toBeCloseTo(start.player.x, 3);
    expect(right.player.y).toBeCloseTo(start.player.y, 3);

    await hold(page, ['KeyA'], 1);
    const left = await snapshot(page);
    expect(norm(left.player.angle - right.player.angle)).toBeLessThan(-1.8);
  });

  test('can turn and sail at the same time', async ({ page }) => {
    await startMatch(page, { options: QUIET });
    const start = await snapshot(page);
    await hold(page, ['KeyW', 'KeyA'], 0.6);
    const s = await snapshot(page);
    expect(s.player.angle).toBeLessThan(start.player.angle);
    expect(s.player.x).toBeLessThan(start.player.x);
    expect(s.player.y).toBeLessThan(start.player.y);
  });

  test('cannot leave the arena on any side', async ({ page }) => {
    await startMatch(page, { options: QUIET });
    // North wall.
    await hold(page, ['KeyW'], 6);
    let s = await snapshot(page);
    expect(s.player.y).toBeCloseTo(s.player.radius, 3);
    // Turn west (from north, a quarter turn left) and hit the west wall.
    await hold(page, ['KeyA'], 0.72);
    await hold(page, ['KeyW'], 8);
    s = await snapshot(page);
    expect(s.player.x).toBeGreaterThanOrEqual(s.player.radius - 1e-6);
    expect(s.player.x).toBeLessThan(s.player.radius + 15);
    // The ship is still fully inside the arena.
    expect(s.player.y).toBeGreaterThanOrEqual(s.player.radius - 1e-6);
    expect(s.player.y).toBeLessThanOrEqual(s.arena.height - s.player.radius + 1e-6);
  });

  test('is blocked by islands and never overlaps one', async ({ page }) => {
    await startMatch(page, { options: QUIET });
    // Face east (quarter turn right), then sail straight at the island south-east of the start.
    await hold(page, ['KeyD'], 0.72);
    const target = (await snapshot(page)).islands.find((i) => i.x > 800 && i.y > 500);
    if (!target) throw new Error('expected an island on the east side');

    let closest = Infinity;
    let minGap = Infinity;
    await page.keyboard.down('KeyW');
    for (let i = 0; i < 40; i++) {
      await advance(page, 0.15);
      const { player, islands } = await snapshot(page);
      for (const isl of islands) minGap = Math.min(minGap, Math.hypot(player.x - isl.x, player.y - isl.y) - (isl.radius + player.radius));
      closest = Math.min(closest, Math.hypot(player.x - target.x, player.y - target.y) - (target.radius + player.radius));
    }
    await page.keyboard.up('KeyW');
    expect(minGap).toBeGreaterThanOrEqual(-0.01); // never inside any island
    expect(closest).toBeLessThan(2); // and it really did run into it
  });
});
