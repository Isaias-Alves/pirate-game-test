import { describe, expect, it } from 'vitest';
import { gameConfig, type GameConfig } from '../gameConfig';
import { emptyInput, type InputState } from '../input/InputState';
import { Simulation } from './Simulation';
import type { Enemy } from './types';

const DT = gameConfig.simulation.fixedStep;
const run = (sim: Simulation, seconds: number, patch: Partial<InputState> = {}) => {
  const input = { ...emptyInput(), ...patch };
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.step(DT, input);
};

const withDuration = (duration: number): GameConfig => ({ ...gameConfig, session: { ...gameConfig.session, duration } });

const enemyAt = (sim: Simulation, kind: 'chaser' | 'shooter', x: number, y: number, health?: number): Enemy => {
  const stats = sim.config[kind];
  const e: Enemy = {
    id: sim.nextEnemyId++,
    kind,
    x,
    y,
    angle: 0,
    speed: 0,
    radius: stats.radius,
    health: health ?? stats.maxHealth,
    maxHealth: stats.maxHealth,
    cooldown: 0,
    alive: true,
  };
  sim.enemies.push(e);
  return e;
};

const snapshot = (sim: Simulation) =>
  JSON.stringify({
    time: sim.time,
    score: sim.score,
    player: sim.player,
    enemies: sim.enemies,
    projectiles: sim.projectiles,
    spawned: sim.spawnedCount,
  });

describe('match end', () => {
  it('ends by time exactly at the configured duration', () => {
    const sim = new Simulation(withDuration(60));
    sim.player.health = 1e9;
    run(sim, 59);
    expect(sim.status).toBe('playing');
    run(sim, 2);
    expect(sim.status).toBe('ended');
    expect(sim.endReason).toBe('time');
    expect(sim.time).toBe(60);
  });

  it('ends by death when health reaches zero', () => {
    const sim = new Simulation(gameConfig);
    sim.damagePlayer(gameConfig.player.maxHealth, 0, 0);
    run(sim, DT);
    expect(sim.status).toBe('ended');
    expect(sim.endReason).toBe('death');
  });

  it('freezes everything after the end: movement, shots, damage, spawns and score', () => {
    const sim = new Simulation(withDuration(60));
    sim.player.x = 640;
    sim.player.y = 400;
    const target = enemyAt(sim, 'shooter', 640, 250, 1e6);
    run(sim, 3, { forward: true, fireFront: true });
    sim.damagePlayer(1e9, 0, 0);
    run(sim, DT);
    expect(sim.status).toBe('ended');
    const frozen = snapshot(sim);
    run(sim, 10, { forward: true, fireFront: true, fireLeft: true });
    expect(snapshot(sim)).toBe(frozen);
    expect(target.health).toBeGreaterThan(0);
  });

  it('freezes spawning after a time end', () => {
    const sim = new Simulation(withDuration(60));
    sim.player.health = 1e9;
    run(sim, 61);
    const count = sim.spawnedCount;
    run(sim, 30);
    expect(sim.spawnedCount).toBe(count);
  });
});

describe('scoring', () => {
  it('awards one point per enemy destroyed by player fire', () => {
    const sim = new Simulation({ ...gameConfig, spawn: { ...gameConfig.spawn, interval: 1e9 } });
    sim.player.x = 640;
    sim.player.y = 500;
    enemyAt(sim, 'chaser', 640, 350, 10);
    run(sim, DT, { fireFront: true });
    run(sim, 1);
    expect(sim.score).toBe(1);
  });

  it('does not double count when two projectiles reach a dying enemy together', () => {
    const sim = new Simulation({ ...gameConfig, spawn: { ...gameConfig.spawn, interval: 1e9 } });
    sim.player.x = 640;
    sim.player.y = 500;
    enemyAt(sim, 'shooter', 640, 350, 10);
    sim.fire('player', 640, 400, -Math.PI / 2, gameConfig.player.front);
    sim.fire('player', 640, 400, -Math.PI / 2, gameConfig.player.front);
    run(sim, 1);
    expect(sim.score).toBe(1);
  });

  it('does not score a Chaser that self-destructs on the player', () => {
    const sim = new Simulation({ ...gameConfig, spawn: { ...gameConfig.spawn, interval: 1e9 } });
    sim.player.x = 640;
    sim.player.y = 500;
    enemyAt(sim, 'chaser', 640, 350);
    run(sim, 6);
    expect(sim.enemies).toHaveLength(0);
    expect(sim.player.health).toBe(gameConfig.player.maxHealth - gameConfig.chaser.contactDamage);
    expect(sim.score).toBe(0);
  });
});

describe('config snapshot', () => {
  it('uses the duration and spawn interval it was created with', () => {
    const a = new Simulation(withDuration(60));
    const b = new Simulation(withDuration(180));
    expect(a.duration).toBe(60);
    expect(b.duration).toBe(180);
  });
});
