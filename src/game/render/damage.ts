/**
 * Damage presentation rules, kept free of Pixi so they can be unit-tested.
 * Stages match the ship art: 0 intact, 1 light damage, 2 heavy damage, 3 wreck.
 */
export type DamageStage = 0 | 1 | 2 | 3;

export function damageStage(healthFraction: number, [light, heavy, wreck]: readonly [number, number, number]): DamageStage {
  if (healthFraction > light) return 0;
  if (healthFraction > heavy) return 1;
  if (healthFraction > wreck) return 2;
  return 3;
}

/** Fires on deck: none while the hull holds, one when heavily damaged, two on a wreck. */
export const flameCount = (stage: DamageStage): number => Math.max(0, stage - 1);
