import type { ShipStats } from '../gameConfig';
import { circlesOverlap } from './collision';
import type { Simulation } from './Simulation';
import type { Enemy, EnemyKind } from './types';

function pickKind(sim: Simulation): EnemyKind {
  const { spawn } = sim.config;
  const opening = spawn.opening[sim.spawnedCount];
  if (opening) return opening;
  const { chaser, shooter } = spawn.weights;
  return sim.rng() * (chaser + shooter) < chaser ? 'chaser' : 'shooter';
}

/**
 * Finds a spawn point that is inside the arena, clear of islands, other ships and the player.
 * Returns undefined if none was found within the attempt budget (the caller retries next tick).
 */
export function findSpawnPoint(sim: Simulation, radius: number): { x: number; y: number } | undefined {
  const { spawn, arena } = sim.config;
  const margin = radius + spawn.clearance;
  for (let i = 0; i < spawn.maxAttempts; i++) {
    const c = {
      x: margin + sim.rng() * (arena.width - 2 * margin),
      y: margin + sim.rng() * (arena.height - 2 * margin),
      radius,
    };
    const px = c.x - sim.player.x;
    const py = c.y - sim.player.y;
    if (Math.hypot(px, py) < spawn.minPlayerDistance) continue;
    const blocked =
      sim.islands.some((isl) => circlesOverlap(c, { ...isl, radius: isl.radius + spawn.clearance })) ||
      sim.enemies.some((e) => e.alive && circlesOverlap(c, { ...e, radius: e.radius + spawn.clearance / 2 }));
    if (!blocked) return c;
  }
  return undefined;
}

/** Advances the spawn clock and spawns one enemy per elapsed interval. */
export function stepSpawner(sim: Simulation, dt: number): void {
  sim.spawnTimer += dt;
  if (sim.spawnTimer < sim.config.spawn.interval) return;

  const kind = pickKind(sim);
  const stats: ShipStats = sim.config[kind];
  const point = findSpawnPoint(sim, stats.radius);
  if (!point) return; // keep the timer; try again next tick

  sim.spawnTimer -= sim.config.spawn.interval;
  const enemy: Enemy = {
    id: sim.nextEnemyId++,
    kind,
    x: point.x,
    y: point.y,
    angle: Math.atan2(sim.player.y - point.y, sim.player.x - point.x),
    speed: 0,
    radius: stats.radius,
    health: stats.maxHealth,
    maxHealth: stats.maxHealth,
    // A new Shooter waits a full reload before its first shot.
    cooldown: kind === 'shooter' ? sim.config.shooter.weapon.cooldown : 0,
    alive: true,
  };
  sim.enemies.push(enemy);
  sim.spawnedCount += 1;
}
