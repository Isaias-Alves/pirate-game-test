import { describe, expect, it } from 'vitest';
import { gameConfig } from '../gameConfig';
import { emptyInput, type InputState } from '../input/InputState';
import { Simulation } from './Simulation';

const DT = gameConfig.simulation.fixedStep;
const run = (sim: Simulation, seconds: number, patch: Partial<InputState>) => {
  const input = { ...emptyInput(), ...patch };
  for (let i = 0; i < Math.round(seconds / DT); i++) sim.step(DT, input);
};

describe('player movement', () => {
  it('moves forward along its heading', () => {
    const sim = new Simulation(gameConfig);
    const y0 = sim.player.y;
    run(sim, 1, { forward: true });
    expect(sim.player.y).toBeLessThan(y0); // start heading is north (-y)
    expect(Math.abs(sim.player.x - gameConfig.arena.playerStart.x)).toBeLessThan(1e-6);
  });

  it('rotates in both directions', () => {
    const sim = new Simulation(gameConfig);
    const a0 = sim.player.angle;
    run(sim, 0.5, { turnRight: true });
    expect(sim.player.angle).toBeGreaterThan(a0);
    run(sim, 1, { turnLeft: true });
    expect(sim.player.angle).toBeLessThan(a0);
  });

  it('gives close results for the same simulated time at different step sizes', () => {
    const a = new Simulation(gameConfig);
    const b = new Simulation(gameConfig);
    const input = { ...emptyInput(), forward: true, turnRight: true };
    for (let i = 0; i < 60; i++) a.step(1 / 60, input);
    for (let i = 0; i < 120; i++) b.step(1 / 120, input);
    expect(Math.hypot(a.player.x - b.player.x, a.player.y - b.player.y)).toBeLessThan(4);
  });

  it('never leaves the arena', () => {
    const sim = new Simulation(gameConfig);
    run(sim, 30, { forward: true });
    const { width, height } = gameConfig.arena;
    const p = sim.player;
    expect(p.x).toBeGreaterThanOrEqual(p.radius);
    expect(p.y).toBeGreaterThanOrEqual(p.radius);
    expect(p.x).toBeLessThanOrEqual(width - p.radius);
    expect(p.y).toBeLessThanOrEqual(height - p.radius);
  });

  it('cannot pass through an island', () => {
    const sim = new Simulation(gameConfig);
    const island = sim.islands[0];
    if (!island) throw new Error('config needs an island');
    sim.player.x = island.x;
    sim.player.y = island.y + island.radius + sim.player.radius + 80;
    sim.player.angle = -Math.PI / 2;
    run(sim, 10, { forward: true });
    const d = Math.hypot(sim.player.x - island.x, sim.player.y - island.y);
    expect(d).toBeGreaterThanOrEqual(island.radius + sim.player.radius - 1e-6);
  });
});
