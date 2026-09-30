import { circlesOverlap, clampToArena, pushOutOfCircle, segmentHitsCircle } from './collision';
import { clamp, normalizeAngle } from './math';
import type { Simulation } from './Simulation';
import type { Enemy } from './types';

/** Turns `e` toward `desired`, limited by its turn rate. */
function steer(e: Enemy, desired: number, turnSpeed: number, dt: number): void {
  const diff = normalizeAngle(desired - e.angle);
  const maxTurn = turnSpeed * dt;
  e.angle = normalizeAngle(e.angle + clamp(diff, -maxTurn, maxTurn));
}

/**
 * If an island blocks the straight line ahead (and is nearer than the target), returns a heading that
 * swings around the side with more room; otherwise returns `desired` unchanged.
 */
function avoidIslands(sim: Simulation, e: Enemy, desired: number, targetDist: number): number {
  const { islandLookahead, islandMargin } = sim.config.ai;
  const cos = Math.cos(e.angle);
  const sin = Math.sin(e.angle);
  let bestFwd = Infinity;
  let turnAway = 0;
  for (const island of sim.islands) {
    const dx = island.x - e.x;
    const dy = island.y - e.y;
    const ahead = dx * cos + dy * sin;
    if (ahead <= 0 || ahead > islandLookahead + island.radius || ahead > targetDist) continue;
    // Positive = island lies to the ship's right (clockwise side).
    const lateral = -dx * sin + dy * cos;
    if (Math.abs(lateral) >= island.radius + e.radius + islandMargin) continue;
    if (ahead < bestFwd) {
      bestFwd = ahead;
      turnAway = lateral >= 0 ? -1 : 1;
    }
  }
  return turnAway === 0 ? desired : e.angle + (turnAway * Math.PI) / 2;
}

function advance(sim: Simulation, e: Enemy, speed: number, dt: number): void {
  e.speed = speed;
  e.x += Math.cos(e.angle) * speed * dt;
  e.y += Math.sin(e.angle) * speed * dt;
  clampToArena(e, sim.config.arena.width, sim.config.arena.height);
  for (const island of sim.islands) pushOutOfCircle(e, island);
}

function stepChaser(sim: Simulation, e: Enemy, dt: number): void {
  const { chaser } = sim.config;
  const p = sim.player;
  const dist = Math.hypot(p.x - e.x, p.y - e.y);
  const desired = avoidIslands(sim, e, Math.atan2(p.y - e.y, p.x - e.x), dist);
  steer(e, desired, chaser.turnSpeed, dt);
  advance(sim, e, chaser.moveSpeed, dt);
}

function stepShooter(sim: Simulation, e: Enemy, dt: number): void {
  const { shooter } = sim.config;
  const p = sim.player;
  const dist = Math.hypot(p.x - e.x, p.y - e.y);
  const toPlayer = Math.atan2(p.y - e.y, p.x - e.x);
  e.cooldown = Math.max(0, e.cooldown - dt);

  // An island between the ships blocks shots, so the Shooter keeps repositioning instead of firing into it.
  const clearShot = !sim.islands.some((i) => segmentHitsCircle(e.x, e.y, p.x, p.y, i));
  const holding = clearShot && dist <= shooter.attackRange * shooter.holdRangeFactor;
  steer(e, holding ? toPlayer : avoidIslands(sim, e, toPlayer, dist), shooter.turnSpeed, dt);
  advance(sim, e, holding ? 0 : shooter.moveSpeed, dt);

  const aimed = Math.abs(normalizeAngle(toPlayer - e.angle)) <= shooter.aimTolerance;
  if (clearShot && dist <= shooter.attackRange && aimed && e.cooldown === 0) {
    e.cooldown = shooter.weapon.cooldown;
    sim.fire('enemy', e.x + Math.cos(e.angle) * e.radius, e.y + Math.sin(e.angle) * e.radius, e.angle, shooter.weapon, 'enemy');
  }
}

/** A Chaser that touches the player hurts them and is destroyed by the impact (no score). */
function resolveContact(sim: Simulation, e: Enemy): void {
  if (e.kind !== 'chaser' || !circlesOverlap(e, sim.player)) return;
  sim.pushEvent({ type: 'rammed', x: e.x, y: e.y });
  sim.damagePlayer(sim.config.chaser.contactDamage, e.x, e.y);
  e.health = 0;
  e.alive = false;
  sim.pushEvent({ type: 'destroyed', x: e.x, y: e.y, target: 'enemy', targetId: e.id });
}

/** Keeps live ships from overlapping each other and from sitting on top of the player. */
function separate(sim: Simulation): void {
  const live = sim.enemies.filter((e) => e.alive);
  for (let i = 0; i < live.length; i++) {
    const a = live[i];
    if (!a) continue;
    for (let j = i + 1; j < live.length; j++) {
      const b = live[j];
      if (!b || !circlesOverlap(a, b)) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const push = (a.radius + b.radius - dist) / 2;
      a.x -= (dx / dist) * push;
      a.y -= (dy / dist) * push;
      b.x += (dx / dist) * push;
      b.y += (dy / dist) * push;
    }
  }
  const p = sim.player;
  for (const e of live) if (e.kind === 'shooter') pushOutOfCircle(e, p);
}

export function stepEnemies(sim: Simulation, dt: number): void {
  for (const e of sim.enemies) {
    if (!e.alive) continue;
    if (e.kind === 'chaser') stepChaser(sim, e, dt);
    else stepShooter(sim, e, dt);
  }
  separate(sim);
  for (const e of sim.enemies) if (e.alive) resolveContact(sim, e);
}
