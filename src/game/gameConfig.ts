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
  };
  player: ShipStats & {
    /** How quickly speed approaches its target (1/s). Higher = snappier. */
    speedResponse: number;
    front: WeaponStats;
    /** Projectiles per side volley, fired in parallel. */
    side: WeaponStats & { count: number; spacing: number };
  };
  chaser: ShipStats & { contactDamage: number };
  shooter: ShipStats & { weapon: WeaponStats; attackRange: number };
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
    minPlayerDistance: 300,
  },
  player: {
    maxHealth: 100,
    moveSpeed: 180,
    turnSpeed: 2.2,
    radius: 26,
    speedResponse: 2.5,
    front: { damage: 20, cooldown: 0.35, projectileSpeed: 520, projectileLifetime: 1.4 },
    side: { damage: 10, cooldown: 1.1, projectileSpeed: 460, projectileLifetime: 1.1, count: 3, spacing: 22 },
  },
  chaser: { maxHealth: 40, moveSpeed: 130, turnSpeed: 1.8, radius: 24, contactDamage: 25 },
  shooter: {
    maxHealth: 60,
    moveSpeed: 90,
    turnSpeed: 1.5,
    radius: 26,
    attackRange: 320,
    weapon: { damage: 10, cooldown: 1.6, projectileSpeed: 380, projectileLifetime: 1.6 },
  },
};
