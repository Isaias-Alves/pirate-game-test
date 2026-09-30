/** Id used in events for the player's ship (enemy ids start at 1). */
export const PLAYER_ID = 0;

export type Owner = 'player' | 'enemy';

/** Which gun fired: the player's front cannon, a player broadside, or an enemy Shooter. */
export type WeaponKind = 'front' | 'side' | 'enemy';

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  /** Seconds alive. */
  age: number;
  lifetime: number;
  owner: Owner;
  alive: boolean;
}

export type EnemyKind = 'chaser' | 'shooter';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  angle: number;
  speed: number;
  radius: number;
  health: number;
  maxHealth: number;
  /** Seconds until this enemy may fire again (Shooter only). */
  cooldown: number;
  alive: boolean;
}

/** One-shot facts the renderer/audio turn into effects. Drained each frame via Simulation.drainEvents(). */
export type SimEvent =
  | { type: 'shot'; x: number; y: number; angle: number; owner: Owner; weapon: WeaponKind }
  | { type: 'hit'; x: number; y: number; target: 'player' | 'enemy'; targetId: number }
  | { type: 'splash'; x: number; y: number }
  /** A Chaser rammed the player (followed by its own 'destroyed'). */
  | { type: 'rammed'; x: number; y: number }
  | { type: 'destroyed'; x: number; y: number; target: 'player' | 'enemy'; targetId: number };
