import type { EnemyKind } from './sim/types';

/** Central, typed gameplay configuration. No balance value may live outside this file. */

export interface ShipStats {
  maxHealth: number;
  /** World units per second. */
  moveSpeed: number;
  /** Radians per second. */
  turnSpeed: number;
  /** Collision radius in world units. */
  radius: number;
}

export interface IslandConfig {
  x: number;
  y: number;
  /** Collision radius in world units. */
  radius: number;
  /** Key into the island art table in assets.ts. */
  art: 'sand' | 'grass';
}

export interface WeaponStats {
  damage: number;
  /** Minimum seconds between shots. */
  cooldown: number;
  projectileSpeed: number;
  /** Seconds before a projectile expires. */
  projectileLifetime: number;
  /** Hit radius of each projectile in world units. */
  projectileRadius: number;
}

export interface GameConfig {
  arena: { width: number; height: number; islands: IslandConfig[]; playerStart: { x: number; y: number; angle: number } };
  /** Simulation clock. Movement/damage/spawns advance in fixed steps, independent of frame rate. */
  simulation: { fixedStep: number; maxFrameDelta: number };
  /** Active play time in seconds. Player-adjustable within [min, max]. */
  session: { duration: number; minDuration: number; maxDuration: number };
  spawn: {
    /** Seconds between enemy spawns. Player-adjustable within [min, max]. */
    interval: number;
    minInterval: number;
    maxInterval: number;
    /** Relative spawn probability per enemy type. */
    weights: { chaser: number; shooter: number };
    /** Minimum distance from the player at spawn. */
    minPlayerDistance: number;
    /** Spawns are kept this far from arena edges, islands and other ships. */
    clearance: number;
    /** Random positions tried per spawn before giving up until the next tick. */
    maxAttempts: number;
    /** Types spawned first, in order, so both appear even in a short match. Weighted random afterwards. */
    opening: EnemyKind[];
  };
  /** Presentation thresholds tied to gameplay values. */
  feedback: {
    /** Health fractions below which a ship swaps to its next damaged sprite (3 thresholds = 4 stages). */
    damageStageThresholds: [number, number, number];
    /** Fraction of max health at or below which the player is warned. */
    lowHealthFraction: number;
  };
  ai: {
    /** How far ahead (world units) an enemy looks for islands to steer around. */
    islandLookahead: number;
    /** Extra clearance an enemy keeps from island edges while steering. */
    islandMargin: number;
  };
  player: ShipStats & {
    /** How quickly speed approaches its target (1/s). Higher = snappier. */
    speedResponse: number;
    front: WeaponStats;
    /** Projectiles per side volley, fired in parallel. */
    side: WeaponStats & { count: number; spacing: number };
  };
  chaser: ShipStats & { contactDamage: number };
  shooter: ShipStats & {
    weapon: WeaponStats;
    /** Fires when the player is within this distance. */
    attackRange: number;
    /** Stops advancing at this fraction of attackRange (keeps a firing distance instead of ramming). */
    holdRangeFactor: number;
    /** Max angle error (radians) between heading and the player for the Shooter to fire. */
    aimTolerance: number;
  };
}

export const gameConfig: GameConfig = {
  arena: {
    width: 1280,
    height: 720,
    islands: [
      { x: 420, y: 330, radius: 105, art: 'grass' },
      { x: 930, y: 190, radius: 62, art: 'sand' },
      { x: 880, y: 560, radius: 62, art: 'sand' },
    ],
    playerStart: { x: 640, y: 620, angle: -Math.PI / 2 },
  },
  simulation: { fixedStep: 1 / 60, maxFrameDelta: 0.25 },
  session: { duration: 120, minDuration: 60, maxDuration: 180 },
  spawn: {
    interval: 3,
    minInterval: 0.5,
    maxInterval: 10,
    weights: { chaser: 1, shooter: 1 },
    minPlayerDistance: 380,
    clearance: 40,
    maxAttempts: 30,
    opening: ['chaser', 'shooter'],
  },
  feedback: { damageStageThresholds: [0.75, 0.5, 0.25], lowHealthFraction: 0.3 },
  ai: { islandLookahead: 170, islandMargin: 26 },
  player: {
    maxHealth: 100,
    moveSpeed: 180,
    turnSpeed: 2.2,
    radius: 26,
    speedResponse: 2.5,
    front: { damage: 20, cooldown: 0.35, projectileSpeed: 520, projectileLifetime: 1.4, projectileRadius: 5 },
    side: {
      damage: 10,
      cooldown: 1.1,
      projectileSpeed: 460,
      projectileLifetime: 1.1,
      projectileRadius: 5,
      count: 3,
      spacing: 22,
    },
  },
  chaser: { maxHealth: 40, moveSpeed: 130, turnSpeed: 1.8, radius: 24, contactDamage: 25 },
  shooter: {
    maxHealth: 60,
    moveSpeed: 90,
    turnSpeed: 1.5,
    radius: 26,
    attackRange: 320,
    holdRangeFactor: 0.8,
    aimTolerance: 0.12,
    weapon: { damage: 10, cooldown: 1.6, projectileSpeed: 380, projectileLifetime: 1.6, projectileRadius: 5 },
  },
};
