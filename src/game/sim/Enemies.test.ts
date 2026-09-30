import { describe, expect, it } from 'vitest';
import { gameConfig, type GameConfig } from '../gameConfig';
import { emptyInput } from '../input/InputState';
import { Simulation } from './Simulation';
import type { Enemy, EnemyKind } from './types';

const DT = gameConfig.simulation.fixedStep;
const idle = emptyInput();
const run = (sim: Simulation, seconds: number, each?: () => void) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    sim.step(DT, idle);
    each?.();
  }
};

/** Sim with spawning effectively disabled so tests control the enemies. */
const quiet = (seed = 1): Simulation => {
  const cfg: GameConfig = { ...gameConfig, spawn: { ...gameConfig.spawn, interval: 1e9 } };
  return new Simulation(cfg, seed);
};

const addEnemy = (sim: Simulation, kind: EnemyKind, x: number, y: number): Enemy => {
  const stats = sim.config[kind];
  const e: Enemy = {
    id: sim.nextEnemyId++,
    kind,
    x,
    y,
    angle: 0,
    speed: 0,
    radius: stats.radius,
    health: stats.maxHealth,
    maxHealth: stats.maxHealth,
    cooldown: 0,
    alive: true,
  };
  sim.enemies.push(e);
  return e;
};

describe('spawner', () => {
  it('spawns one enemy per configured interval, not before', () => {
    const sim = new Simulation(gameConfig);
    run(sim, gameConfig.spawn.interval - 0.1);
    expect(sim.enemies).toHaveLength(0);
    run(sim, 0.2);
    expect(sim.enemies).toHaveLength(1);
    run(sim, gameConfig.spawn.interval);
    expect(sim.enemies).toHaveLength(2);
  });

  it('follows the opening sequence so both types appear in a short match', () => {
    const sim = new Simulation(gameConfig);
    run(sim, gameConfig.spawn.interval * 2 + 0.1);
    expect(sim.enemies.map((e) => e.kind)).toEqual(gameConfig.spawn.opening);
  });

  it('produces both types in a default-length match', () => {
    const seen = new Set<EnemyKind>();
    const sim = new Simulation(gameConfig, 42);
    const p = sim.player;
    p.health = 1e9; // survive to observe spawns
    p.maxHealth = 1e9;
    run(sim, gameConfig.session.duration, () => {
      for (const e of sim.enemies) seen.add(e.kind);
    });
    expect(seen).toEqual(new Set(['chaser', 'shooter']));
  });

  it('honours a different spawn interval', () => {
    const cfg: GameConfig = { ...gameConfig, spawn: { ...gameConfig.spawn, interval: 1 } };
    const sim = new Simulation(cfg);
    sim.player.health = 1e9;
    run(sim, 3.05);
    expect(sim.spawnedCount).toBe(3);
  });

  it('only spawns in free water, inside the arena and away from the player', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const px = 200 + seed * 30;
      const py = 150 + (seed % 5) * 100;
      const probe = new Simulation(gameConfig, seed);
      probe.player.x = px;
      probe.player.y = py;
      for (let n = 0; n < 8; n++) {
        probe.spawnTimer = gameConfig.spawn.interval;
        const before = probe.enemies.length;
        probe.step(0, idle);
        const e = probe.enemies[before];
        if (!e) continue;
        expect(Math.hypot(e.x - probe.player.x, e.y - probe.player.y)).toBeGreaterThanOrEqual(gameConfig.spawn.minPlayerDistance);
        expect(e.x - e.radius).toBeGreaterThanOrEqual(0);
        expect(e.y - e.radius).toBeGreaterThanOrEqual(0);
        expect(e.x + e.radius).toBeLessThanOrEqual(gameConfig.arena.width);
        expect(e.y + e.radius).toBeLessThanOrEqual(gameConfig.arena.height);
        for (const isl of probe.islands) {
          expect(Math.hypot(e.x - isl.x, e.y - isl.y)).toBeGreaterThan(isl.radius + e.radius);
        }
      }
    }
  });
});

describe('chaser', () => {
  it('closes in on the player, hurts them once on contact and is destroyed without scoring', () => {
    const sim = quiet();
    sim.player.x = 900;
    sim.player.y = 640;
    const e = addEnemy(sim, 'chaser', 900, 400);
    run(sim, 6);
    expect(sim.player.health).toBe(gameConfig.player.maxHealth - gameConfig.chaser.contactDamage);
    expect(e.alive).toBe(false);
    expect(sim.enemies).toHaveLength(0);
    // Only one impact even though the player never moved.
    run(sim, 2);
    expect(sim.player.health).toBe(gameConfig.player.maxHealth - gameConfig.chaser.contactDamage);
  });

  it('steers around an island instead of getting stuck behind it', () => {
    const sim = quiet();
    const isl = sim.islands[0];
    if (!isl) throw new Error('need island');
    sim.player.x = isl.x;
    sim.player.y = isl.y + isl.radius + 120;
    const e = addEnemy(sim, 'chaser', isl.x, isl.y - isl.radius - 120);
    e.angle = Math.PI / 2;
    run(sim, 15);
    expect(sim.player.health).toBeLessThan(gameConfig.player.maxHealth);
  });

  it('never overlaps an island while moving', () => {
    const sim = quiet();
    const isl = sim.islands[0];
    if (!isl) throw new Error('need island');
    sim.player.x = isl.x + 300;
    sim.player.y = isl.y;
    const e = addEnemy(sim, 'chaser', isl.x - 300, isl.y);
    run(sim, 10, () => {
      if (e.alive) expect(Math.hypot(e.x - isl.x, e.y - isl.y)).toBeGreaterThanOrEqual(isl.radius + e.radius - 1e-6);
    });
  });
});

describe('shooter', () => {
  it('approaches, then holds at range and fires at the player', () => {
    const sim = quiet();
    sim.player.x = 900;
    sim.player.y = 640;
    const e = addEnemy(sim, 'shooter', 900, 200);
    let shots = 0;
    run(sim, 8, () => {
      shots += sim.drainEvents().filter((ev) => ev.type === 'shot' && ev.owner === 'enemy').length;
    });
    const dist = Math.hypot(e.x - sim.player.x, e.y - sim.player.y);
    expect(dist).toBeLessThanOrEqual(gameConfig.shooter.attackRange);
    expect(dist).toBeGreaterThan(gameConfig.shooter.radius + gameConfig.player.radius);
    expect(shots).toBeGreaterThan(0);
    expect(sim.player.health).toBeLessThan(gameConfig.player.maxHealth);
  });

  it('does not fire while the player is out of attack range', () => {
    const sim = quiet();
    sim.player.x = 1200;
    sim.player.y = 680;
    const e = addEnemy(sim, 'shooter', 60, 60);
    let early = 0;
    run(sim, 1.5, () => {
      early += sim.drainEvents().filter((ev) => ev.type === 'shot').length;
    });
    expect(Math.hypot(e.x - sim.player.x, e.y - sim.player.y)).toBeGreaterThan(gameConfig.shooter.attackRange);
    expect(early).toBe(0);
  });

  it('respects its firing cooldown', () => {
    const sim = quiet();
    sim.player.x = 900;
    sim.player.y = 640;
    addEnemy(sim, 'shooter', 900, 640 - 250);
    let shots = 0;
    run(sim, 5, () => {
      shots += sim.drainEvents().filter((ev) => ev.type === 'shot' && ev.owner === 'enemy').length;
    });
    expect(shots).toBeLessThanOrEqual(Math.ceil(5 / gameConfig.shooter.weapon.cooldown) + 1);
  });
});

describe('destroyed enemies', () => {
  it('are removed and stop shooting or colliding', () => {
    const sim = quiet();
    sim.player.x = 900;
    sim.player.y = 640;
    const e = addEnemy(sim, 'shooter', 900, 640 - 250);
    sim.damageEnemy(e, 1e6, e.x, e.y);
    sim.drainEvents();
    run(sim, 3);
    expect(sim.enemies).toHaveLength(0);
    expect(sim.drainEvents().some((ev) => ev.type === 'shot')).toBe(false);
    expect(sim.player.health).toBe(gameConfig.player.maxHealth);
  });
});

describe('ship separation', () => {
  it('never pushes a ship into an island or out of the arena', () => {
    const sim = quiet();
    const isl = sim.islands[0];
    if (!isl) throw new Error('need island');
    const r = sim.config.chaser.radius;
    // One ship pinned against the island's east shore and one against the west wall, each overlapped from outside.
    addEnemy(sim, 'chaser', isl.x + isl.radius + r, isl.y);
    addEnemy(sim, 'chaser', isl.x + isl.radius + r + 20, isl.y);
    addEnemy(sim, 'chaser', r, 100);
    addEnemy(sim, 'chaser', r + 20, 100);
    sim.step(DT, idle);
    for (const e of sim.enemies) {
      expect(Math.hypot(e.x - isl.x, e.y - isl.y)).toBeGreaterThanOrEqual(isl.radius + e.radius - 1e-6);
      expect(e.x).toBeGreaterThanOrEqual(e.radius - 1e-6);
    }
  });
});
