import { advance, expect, hold, norm, snapshot, startMatch, test, type Snapshot } from './support';
import { gameConfig } from '../src/game/gameConfig';

// Quiet start: with the longest spawn interval the first enemy only arrives at t = 10 s.
const QUIET = { sessionSeconds: 180, spawnInterval: 10 } as const;
const mine = (s: Snapshot) => s.projectiles.filter((p) => p.owner === 'player');

test.describe('Player weapons', () => {
  test('front fire launches one projectile along the heading and honours its cooldown', async ({ page }) => {
    await startMatch(page, { options: QUIET });
    await hold(page, ['Space'], 0.05);
    let s = await snapshot(page);
    expect(mine(s)).toHaveLength(1);
    const ball = mine(s)[0];
    expect(ball?.vy).toBeLessThan(0); // heading north
    expect(Math.abs(ball?.vx ?? 1)).toBeLessThan(1e-6);
    expect(ball?.damage).toBe(gameConfig.player.front.damage);

    // Holding the key for less than one cooldown never adds a second shot.
    await page.keyboard.down('Space');
    await advance(page, gameConfig.player.front.cooldown * 0.8);
    s = await snapshot(page);
    expect(mine(s)).toHaveLength(1);
    // Past the cooldown it fires again, but no faster than once per cooldown.
    await advance(page, gameConfig.player.front.cooldown * 2);
    await page.keyboard.up('Space');
    s = await snapshot(page);
    const expected = Math.floor((0.05 + gameConfig.player.front.cooldown * 2.8) / gameConfig.player.front.cooldown) + 1;
    expect(mine(s).length).toBeLessThanOrEqual(expected);
    expect(mine(s).length).toBeGreaterThanOrEqual(3);
  });

  test('a side volley launches three parallel projectiles to the correct side', async ({ page }) => {
    await startMatch(page, { options: QUIET });
    await hold(page, ['KeyE'], 0.05);
    const right = mine(await snapshot(page));
    expect(right).toHaveLength(3);
    expect(right.every((p) => p.vx > 0 && Math.abs(p.vy) < 1e-6)).toBe(true); // facing north: starboard is east
    expect(new Set(right.map((p) => Math.round(p.y))).size).toBe(3); // spread along the hull, side by side
    expect(new Set(right.map((p) => p.vx)).size).toBe(1); // parallel

    await hold(page, ['KeyQ'], 0.05);
    const all = mine(await snapshot(page));
    expect(all).toHaveLength(6);
    expect(all.filter((p) => p.vx < 0)).toHaveLength(3); // port side is west
  });

  test('left and right broadsides have independent cooldowns; a broadside cannot repeat early', async ({ page }) => {
    await startMatch(page, { options: QUIET });
    await hold(page, ['KeyE'], 0.05);
    await hold(page, ['KeyE', 'KeyQ'], 0.05); // right is cooling down, left is ready
    const s = await snapshot(page);
    expect(mine(s)).toHaveLength(6);
  });

  test('can sail and fire at once, and projectiles expire or leave the arena', async ({ page }) => {
    await startMatch(page, { options: QUIET });
    const start = await snapshot(page);
    await hold(page, ['KeyW', 'Space'], 1);
    const s = await snapshot(page);
    expect(s.player.y).toBeLessThan(start.player.y - 60);
    expect(mine(s).length).toBeGreaterThanOrEqual(3);
    await advance(page, 3);
    expect(mine(await snapshot(page))).toHaveLength(0);
  });

  test('an island removes a projectile long before it would expire', async ({ page }) => {
    await startMatch(page, { options: QUIET });
    // Control: in open water a port-side volley is still flying 0.3 s later.
    await hold(page, ['KeyQ'], 0.02);
    await advance(page, 0.3);
    expect(mine(await snapshot(page))).toHaveLength(3);
    await advance(page, 1.5); // let it expire and the cannon reload

    // Face east and run into the south-east island; the ship ends up pressed against its south-west shore.
    await hold(page, ['KeyD'], 0.72);
    await hold(page, ['KeyW'], 1.5);
    // Port broadside now points north, straight at the island's shore.
    await hold(page, ['KeyQ'], 0.02);
    await advance(page, 0.3);
    expect(mine(await snapshot(page))).toHaveLength(0);
  });

  test('destroying an enemy with cannon fire scores exactly one point', async ({ page, errors }) => {
    await startMatch(page, { options: QUIET, gameSeed: 1 });
    await advance(page, 10.05); // first enemy (a Chaser) appears
    let s = await snapshot(page);
    expect(s.enemies).toHaveLength(1);
    expect(s.enemies[0]?.kind).toBe('chaser');
    expect(s.score).toBe(0);

    // Steer with the real turn keys and fire the front cannon whenever the enemy is in the sights.
    let turning: 'KeyA' | 'KeyD' | null = null;
    const steer = async (key: 'KeyA' | 'KeyD' | null) => {
      if (turning === key) return;
      if (turning) await page.keyboard.up(turning);
      if (key) await page.keyboard.down(key);
      turning = key;
    };
    let firing = false;
    const healthSeen = new Set<number>([gameConfig.chaser.maxHealth]);
    for (let i = 0; i < 160 && s.score === 0 && s.phase === 'playing'; i++) {
      const target = s.enemies[0];
      if (!target) break;
      const bearing = Math.atan2(target.y - s.player.y, target.x - s.player.x);
      const diff = norm(bearing - s.player.angle);
      await steer(Math.abs(diff) < 0.05 ? null : diff > 0 ? 'KeyD' : 'KeyA');
      const shouldFire = Math.abs(diff) < 0.12;
      if (shouldFire !== firing) {
        await (shouldFire ? page.keyboard.down('Space') : page.keyboard.up('Space'));
        firing = shouldFire;
      }
      await advance(page, 0.05);
      s = await snapshot(page);
      const seen = s.enemies[0]?.health;
      if (seen !== undefined) healthSeen.add(seen);
    }
    await steer(null);
    if (firing) await page.keyboard.up('Space');

    expect(s.score).toBe(1);
    expect(s.enemies).toHaveLength(0);
    // Damage is applied once per projectile: health only ever dropped in whole cannon hits.
    const hit = gameConfig.player.front.damage;
    for (const h of healthSeen) expect((gameConfig.chaser.maxHealth - h) % hit).toBe(0);
    // Idle afterwards: the score is not awarded twice, and no dead enemy lingers.
    await advance(page, 3);
    s = await snapshot(page);
    expect(s.score).toBe(1);
    expect(s.enemies.filter((e) => e.health <= 0)).toHaveLength(0);
    expect(errors).toEqual([]);
  });
});
