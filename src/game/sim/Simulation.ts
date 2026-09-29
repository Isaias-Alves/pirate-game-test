import type { GameConfig } from '../gameConfig';
import type { InputState } from '../input/InputState';
import { clampToArena, pushOutOfCircle } from './collision';
import { createRng, type Rng } from './rng';

export interface PlayerShip {
  x: number;
  y: number;
  /** Radians; 0 = facing +x, positive = clockwise on screen (y grows downward). */
  angle: number;
  speed: number;
  radius: number;
}

export interface Island {
  x: number;
  y: number;
  radius: number;
  art: 'sand' | 'grass';
}

/**
 * Pure game rules. No Pixi, no DOM, no wall clock: callers feed it fixed `dt` steps,
 * which keeps movement/damage/spawns independent of frame rate and unit-testable.
 */
export class Simulation {
  readonly config: GameConfig;
  readonly rng: Rng;
  readonly islands: readonly Island[];
  readonly player: PlayerShip;
  /** Active (unpaused) simulated seconds since the match started. */
  time = 0;

  constructor(config: GameConfig, seed = 1) {
    this.config = config;
    this.rng = createRng(seed);
    this.islands = config.arena.islands.map((i) => ({ ...i }));
    const start = config.arena.playerStart;
    this.player = { x: start.x, y: start.y, angle: start.angle, speed: 0, radius: config.player.radius };
  }

  step(dt: number, input: InputState): void {
    this.time += dt;
    this.stepPlayer(dt, input);
  }

  private stepPlayer(dt: number, input: InputState): void {
    const { player: p, config } = this;
    const stats = config.player;

    const turn = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
    p.angle += turn * stats.turnSpeed * dt;

    // Exponential approach to the target speed.
    const target = input.forward ? stats.moveSpeed : 0;
    p.speed += (target - p.speed) * Math.min(1, stats.speedResponse * dt);

    p.x += Math.cos(p.angle) * p.speed * dt;
    p.y += Math.sin(p.angle) * p.speed * dt;

    clampToArena(p, config.arena.width, config.arena.height);
    for (const island of this.islands) pushOutOfCircle(p, island);
  }
}
