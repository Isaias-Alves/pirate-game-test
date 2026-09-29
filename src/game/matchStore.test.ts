import { describe, expect, it } from 'vitest';
import { MatchStore, initialSnapshot } from './matchStore';

describe('MatchStore', () => {
  it('notifies only when a visible value changes', () => {
    const store = new MatchStore();
    let calls = 0;
    const off = store.subscribe(() => {
      calls += 1;
    });
    store.publish({ ...initialSnapshot });
    store.publish({ ...initialSnapshot });
    expect(calls).toBe(0);
    store.publish({ ...initialSnapshot, score: 1 });
    store.publish({ ...initialSnapshot, score: 1 });
    expect(calls).toBe(1);
    expect(store.getSnapshot().score).toBe(1);
    off();
    store.publish({ ...initialSnapshot, score: 2 });
    expect(calls).toBe(1);
  });
});
