/** Central, typed gameplay configuration. No balance value may live outside this file. */

export interface ShipStats {
  maxHealth: number;
  /** World units per second. */
  moveSpeed: number;
  /** Radians per second. */
  turnSpeed: number;
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
  arena: { width: number; height: number };
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
    front: WeaponStats;
    /** Projectiles per side volley, fired in parallel. */
    side: WeaponStats & { count: number; spacing: number };
  };
  chaser: ShipStats & { contactDamage: number };
  shooter: ShipStats & { weapon: WeaponStats; attackRange: number };
}

export const gameConfig: GameConfig = {
  arena: { width: 1280, height: 720 },
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
    front: { damage: 20, cooldown: 0.35, projectileSpeed: 520, projectileLifetime: 1.4 },
    side: { damage: 10, cooldown: 1.1, projectileSpeed: 460, projectileLifetime: 1.1, count: 3, spacing: 22 },
  },
  chaser: { maxHealth: 40, moveSpeed: 130, turnSpeed: 1.8, contactDamage: 25 },
  shooter: {
    maxHealth: 60,
    moveSpeed: 90,
    turnSpeed: 1.5,
    attackRange: 320,
    weapon: { damage: 10, cooldown: 1.6, projectileSpeed: 380, projectileLifetime: 1.6 },
  },
};
