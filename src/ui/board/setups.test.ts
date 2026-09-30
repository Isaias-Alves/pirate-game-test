import { describe, expect, it } from 'vitest';
import { rankingSetups, setupId } from './setups';

describe('rankingSetups', () => {
  it('lists the player setup first and never repeats a setup', () => {
    const list = rankingSetups({ sessionSeconds: 120, spawnInterval: 3 });
    expect(list[0]?.label).toMatch(/^Your setup/);
    expect(list[0]?.settings).toEqual({ sessionSeconds: 120, spawnInterval: 3 });
    const ids = list.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === '120/3')).toHaveLength(1);
  });

  it('keeps every preset when the player uses a custom setup', () => {
    const list = rankingSetups({ sessionSeconds: 75, spawnInterval: 2.5 });
    expect(list).toHaveLength(6);
    expect(list[0]?.id).toBe(setupId({ sessionSeconds: 75, spawnInterval: 2.5 }));
  });
});
