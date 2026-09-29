import type { GameConfig, WeaponStats } from '../gameConfig';
import type { InputState } from '../input/InputState';
import { clampToArena, pushOutOfCircle, segmentHitsCircle } from './collision';
import { stepEnemies } from './enemyAI';
import { createRng, type Rng } from './rng';
import { stepSpawner } from './spawner';
import { PLAYER_ID, type Enemy, type Owner, type Projectile, type SimEvent } from './types';

export interface PlayerShip {
  x: number;
  y: number;
  /** Radians; 0 = facing +x, positive = clockwise on screen (y grows downward). */
  angle: number;
  speed: number;
  radius: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  /** Seconds until each weapon may fire again. */
  cooldowns: { front: number; left: number; right: number };
}

export type MatchStatus = 'playing' | 'ended';
export type EndReason = 'time' | 'death';

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
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  /** Active (unpaused) simulated seconds since the match started. Never exceeds `duration`. */
  time = 0;
  /** Match length in seconds, fixed from the config snapshot given at construction. */
  readonly duration: number;
  /** One point per enemy destroyed by the player's fire (Chaser self-destructs do not count). */
  score = 0;
  status: MatchStatus = 'playing';
  endReason: EndReason | null = null;
  /** Seconds accumulated toward the next spawn. */
  spawnTimer = 0;
  /** Enemies spawned so far (drives the opening sequence). */
  spawnedCount = 0;
  nextEnemyId = 1;
  private events: SimEvent[] = [];

  constructor(config: GameConfig, seed = 1) {
    this.config = config;
    this.rng = createRng(seed);
    this.duration = config.session.duration;
    this.islands = config.arena.islands.map((i) => ({ ...i }));
    const start = config.arena.playerStart;
    this.player = {
      x: start.x,
      y: start.y,
      angle: start.angle,
      speed: 0,
      radius: config.player.radius,
      health: config.player.maxHealth,
      maxHealth: config.player.maxHealth,
      alive: true,
      cooldowns: { front: 0, left: 0, right: 0 },
    };
  }

  /** Advances the match. Once ended, nothing moves, shoots, spawns, takes damage or scores. */
  step(dt: number, input: InputState): void {
    if (this.status === 'ended') return;
    this.time = Math.min(this.time + dt, this.duration);
    if (this.player.alive) {
      this.stepPlayer(dt, input);
      this.stepWeapons(dt, input);
    }
    stepSpawner(this, dt);
    stepEnemies(this, dt);
    this.stepProjectiles(dt);
    this.sweepEnemies();
    this.checkEnd();
  }

  private checkEnd(): void {
    if (!this.player.alive) this.end('death');
    else if (this.time >= this.duration) this.end('time');
  }

  private end(reason: EndReason): void {
    this.status = 'ended';
    this.endReason = reason;
  }

  pushEvent(e: SimEvent): void {
    this.events.push(e);
  }

  /** Destroyed enemies leave the world: they no longer collide, shoot or hurt anyone. */
  private sweepEnemies(): void {
    let w = 0;
    for (const e of this.enemies) if (e.alive) this.enemies[w++] = e;
    this.enemies.length = w;
  }

  /** Returns and clears the effects queued since the last call. */
  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
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

  private stepWeapons(dt: number, input: InputState): void {
    const { player: p, config } = this;
    const cd = p.cooldowns;
    cd.front = Math.max(0, cd.front - dt);
    cd.left = Math.max(0, cd.left - dt);
    cd.right = Math.max(0, cd.right - dt);

    if (input.fireFront && cd.front === 0) {
      cd.front = config.player.front.cooldown;
      this.fire('player', p.x + Math.cos(p.angle) * p.radius, p.y + Math.sin(p.angle) * p.radius, p.angle, config.player.front);
    }
    if (input.fireLeft && cd.left === 0) {
      cd.left = config.player.side.cooldown;
      this.fireBroadside(-1);
    }
    if (input.fireRight && cd.right === 0) {
      cd.right = config.player.side.cooldown;
      this.fireBroadside(1);
    }
  }

  /** `side` is -1 for port (left) and +1 for starboard (right); N parallel shots along the hull. */
  private fireBroadside(side: -1 | 1): void {
    const { player: p, config } = this;
    const { count, spacing } = config.player.side;
    const angle = p.angle + (side * Math.PI) / 2;
    const fx = Math.cos(p.angle);
    const fy = Math.sin(p.angle);
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);
    for (let i = 0; i < count; i++) {
      const along = (i - (count - 1) / 2) * spacing;
      this.fire('player', p.x + fx * along + nx * p.radius, p.y + fy * along + ny * p.radius, angle, config.player.side);
    }
  }

  /** Spawns one projectile. Shared by the player and enemy shooters. */
  fire(owner: Owner, x: number, y: number, angle: number, weapon: WeaponStats): void {
    this.projectiles.push({
      x,
      y,
      vx: Math.cos(angle) * weapon.projectileSpeed,
      vy: Math.sin(angle) * weapon.projectileSpeed,
      damage: weapon.damage,
      radius: weapon.projectileRadius,
      age: 0,
      lifetime: weapon.projectileLifetime,
      owner,
      alive: true,
    });
    this.events.push({ type: 'shot', x, y, angle, owner });
  }

  /**
   * Moves projectiles and resolves what each one hits. A projectile that hits anything is marked
   * dead on the spot, so it can never damage twice; dead ones are swept out at the end of the step.
   */
  private stepProjectiles(dt: number): void {
    const { width, height } = this.config.arena;
    for (const b of this.projectiles) {
      const px = b.x;
      const py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.age += dt;

      if (b.x < 0 || b.y < 0 || b.x > width || b.y > height || b.age >= b.lifetime) {
        b.alive = false;
        continue;
      }
      if (this.hitsIsland(px, py, b)) {
        b.alive = false;
        this.events.push({ type: 'splash', x: b.x, y: b.y });
        continue;
      }
      if (b.owner === 'player') this.hitEnemies(px, py, b);
      else this.hitPlayer(px, py, b);
    }
    // Sweep dead projectiles in place (no allocation).
    let w = 0;
    for (const b of this.projectiles) if (b.alive) this.projectiles[w++] = b;
    this.projectiles.length = w;
  }

  private hitsIsland(px: number, py: number, b: Projectile): boolean {
    return this.islands.some((i) => segmentHitsCircle(px, py, b.x, b.y, i));
  }

  private hitEnemies(px: number, py: number, b: Projectile): void {
    for (const e of this.enemies) {
      if (!e.alive || !segmentHitsCircle(px, py, b.x, b.y, e, b.radius)) continue;
      b.alive = false;
      this.damageEnemy(e, b.damage, b.x, b.y);
      if (e.health <= 0) this.score += 1;
      return;
    }
  }

  private hitPlayer(px: number, py: number, b: Projectile): void {
    const p = this.player;
    if (!p.alive || !segmentHitsCircle(px, py, b.x, b.y, p, b.radius)) return;
    b.alive = false;
    this.damagePlayer(b.damage, b.x, b.y);
  }

  damageEnemy(e: Enemy, amount: number, x: number, y: number): void {
    if (!e.alive) return;
    e.health = Math.max(0, e.health - amount);
    this.events.push({ type: 'hit', x, y, target: 'enemy', targetId: e.id });
    if (e.health === 0) {
      e.alive = false;
      this.events.push({ type: 'destroyed', x: e.x, y: e.y, target: 'enemy', targetId: e.id });
    }
  }

  damagePlayer(amount: number, x: number, y: number): void {
    const p = this.player;
    if (!p.alive) return;
    p.health = Math.max(0, p.health - amount);
    this.events.push({ type: 'hit', x, y, target: 'player', targetId: PLAYER_ID });
    if (p.health === 0) {
      p.alive = false;
      this.events.push({ type: 'destroyed', x: p.x, y: p.y, target: 'player', targetId: PLAYER_ID });
    }
  }
}
