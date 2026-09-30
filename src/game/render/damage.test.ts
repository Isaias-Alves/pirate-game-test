import { describe, expect, it } from 'vitest';
import { gameConfig } from '../gameConfig';
import { damageStage, flameCount } from './damage';

const T = gameConfig.feedback.damageStageThresholds;

describe('damage presentation', () => {
  it('maps health to the four art stages at the configured thresholds', () => {
    expect(damageStage(1, T)).toBe(0);
    expect(damageStage(T[0] + 0.001, T)).toBe(0);
    expect(damageStage(T[0], T)).toBe(1);
    expect(damageStage(T[1], T)).toBe(2);
    expect(damageStage(T[2], T)).toBe(3);
    expect(damageStage(0, T)).toBe(3);
  });

  it('shows fire only on heavily damaged ships and wrecks', () => {
    expect([0, 1, 2, 3].map((s) => flameCount(s as 0 | 1 | 2 | 3))).toEqual([0, 0, 1, 2]);
  });
});
