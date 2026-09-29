import { describe, expect, it } from 'vitest';
import { gameConfig } from '../gameConfig';
import { emptyInput, type InputState } from '../input/InputState';
import { Simulation } from './Simulation';
import type { Enemy } from './types';

const DT = gameConfig.simulation.fixedStep;
const steps = (sim: Simulation, seconds: number, patch: Partial<InputState> = {}) => {
  const input = { ...emptyInput(), ...patch };
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.step(DT, input);
};

/** A sim whose player sits in open water heading north, away from every island. */
const openWater = () => {
  const sim = new Simulation(gameConfig);
  sim.player.x = 640;
  sim.player.y = 400;
  return sim;
};

const dummyEnemy = (x: number, y: number, health = 40): Enemy => ({
  id: 1,
  kind: 'chaser',
  x,
  y,
  angle: 0,
  speed: 0,
  radius: 24,
  health,
  maxHealth: health,
  cooldown: 0,
  alive: true,
});

describe('player weapons', () => {
  it('front fire spawns one projectile along the heading', () => {
    const sim = openWater();
    steps(sim, DT, { fireFront: true });
    expect(sim.projectiles).toHaveLength(1);
    const b = sim.projectiles[0];
    expect(b?.vy).toBeLessThan(0);
    expect(Math.abs(b?.vx ?? 1)).toBeLessThan(1e-6);
    expect(b?.damage).toBe(gameConfig.player.front.damage);
  });

  it('respects the front cooldown, then fires again', () => {
    const sim = openWater();
    steps(sim, gameConfig.player.front.cooldown * 0.9, { fireFront: true });
    expect(sim.projectiles).toHaveLength(1);
    steps(sim, gameConfig.player.front.cooldown * 0.3, { fireFront: true });
    expect(sim.projectiles.length).toBeGreaterThanOrEqual(2);
  });

  it('side fire spawns N parallel projectiles to the correct side', () => {
    const left = openWater();
    steps(left, DT, { fireLeft: true });
    const right = openWater();
    steps(right, DT, { fireRight: true });
    const n = gameConfig.player.side.count;
    expect(left.projectiles).toHaveLength(n);
    expect(right.projectiles).toHaveLength(n);
    // Heading north: port is west (-x), starboard is east (+x).
    expect(left.projectiles.every((b) => b.vx < 0)).toBe(true);
    expect(right.projectiles.every((b) => b.vx > 0)).toBe(true);
    // Parallel: identical velocity, spread along the hull (distinct y).
    const v = left.projectiles[0];
    if (!v) throw new Error('no projectile');
    expect(left.projectiles.every((b) => b.vx === v.vx && Math.abs(b.vy - v.vy) < 1e-6)).toBe(true);
    expect(new Set(left.projectiles.map((b) => Math.round(b.y))).size).toBe(n);
  });

  it('left and right broadsides have independent cooldowns', () => {
    const sim = openWater();
    steps(sim, DT, { fireLeft: true });
    steps(sim, DT, { fireLeft: true, fireRight: true });
    const n = gameConfig.player.side.count;
    expect(sim.projectiles).toHaveLength(n * 2); // right fired, left still cooling down
  });

  it('can move and fire in the same step', () => {
    const sim = openWater();
    const y0 = sim.player.y;
    steps(sim, 0.5, { forward: true, fireFront: true });
    expect(sim.player.y).toBeLessThan(y0);
    expect(sim.drainEvents().some((e) => e.type === 'shot')).toBe(true);
  });
});

describe('projectile lifecycle', () => {
  it('expires after its lifetime and is removed', () => {
    const sim = openWater();
    steps(sim, DT, { fireLeft: true });
    expect(sim.projectiles.length).toBeGreaterThan(0);
    steps(sim, gameConfig.player.side.projectileLifetime + 0.2);
    expect(sim.projectiles).toHaveLength(0);
  });

  it('is removed when it leaves the arena', () => {
    const sim = openWater();
    sim.player.x = 30;
    steps(sim, DT, { fireLeft: true });
    steps(sim, 0.3);
    expect(sim.projectiles).toHaveLength(0);
  });

  it('is removed by an island', () => {
    const sim = openWater();
    const island = sim.islands[0];
    if (!island) throw new Error('need island');
    sim.player.x = island.x + island.radius + 90;
    sim.player.y = island.y;
    // Fire west (left when heading north) straight at the island.
    steps(sim, DT, { fireLeft: true });
    steps(sim, 0.5);
    expect(sim.projectiles).toHaveLength(0);
    expect(sim.drainEvents().some((e) => e.type === 'splash')).toBe(true);
  });

  it('damages an enemy exactly once and is removed', () => {
    const sim = openWater();
    const e = dummyEnemy(sim.player.x, sim.player.y - 150, 100);
    sim.enemies.push(e);
    steps(sim, DT, { fireFront: true });
    steps(sim, 0.6);
    expect(e.health).toBe(100 - gameConfig.player.front.damage);
    expect(sim.projectiles).toHaveLength(0);
  });

  it('does not tunnel through a target at very high speed', () => {
    const sim = openWater();
    const e = dummyEnemy(sim.player.x, sim.player.y - 150, 100);
    sim.enemies.push(e);
    sim.fire('player', sim.player.x, sim.player.y - 40, -Math.PI / 2, {
      ...gameConfig.player.front,
      projectileSpeed: 20000,
    });
    sim.step(DT, emptyInput());
    expect(e.health).toBeLessThan(100);
  });

  it('a destroyed enemy stops taking hits and its shot is not wasted on it', () => {
    const sim = openWater();
    const e = dummyEnemy(sim.player.x, sim.player.y - 150, 10);
    sim.enemies.push(e);
    steps(sim, DT, { fireFront: true });
    steps(sim, 0.6);
    expect(e.alive).toBe(false);
    expect(e.health).toBe(0);
    const before = sim.drainEvents().filter((ev) => ev.type === 'destroyed').length;
    expect(before).toBe(1);
  });

  it('enemy projectiles hurt the player once; player projectiles never do', () => {
    const sim = openWater();
    sim.fire('enemy', sim.player.x, sim.player.y - 100, Math.PI / 2, gameConfig.shooter.weapon);
    steps(sim, 0.6);
    expect(sim.player.health).toBe(gameConfig.player.maxHealth - gameConfig.shooter.weapon.damage);

    const own = openWater();
    own.fire('player', own.player.x, own.player.y - 100, Math.PI / 2, gameConfig.player.front);
    steps(own, 0.6);
    expect(own.player.health).toBe(gameConfig.player.maxHealth);
  });
});
