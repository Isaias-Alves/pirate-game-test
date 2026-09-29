import { describe, expect, it } from 'vitest';
import type { MatchRecord } from '../api/contracts';
import { parseRecord } from '../api/validate';
import { MockDb, compareHistory, compareRanking, type DbStorage, type StoredDb } from './db';

const memoryStorage = (): DbStorage & { saved: StoredDb | undefined } => {
  const s: DbStorage & { saved: StoredDb | undefined } = {
    saved: undefined,
    read: () => s.saved,
    write: (state) => {
      s.saved = structuredClone(state);
    },
    clear: () => {
      s.saved = undefined;
    },
  };
  return s;
};

const view = { fixtures: true, extraFixtures: false, syntheticHistory: false };
const SETTINGS = { sessionSeconds: 120, spawnInterval: 3 };

const rec = (over: Partial<MatchRecord> = {}): MatchRecord => ({
  matchId: 'm-1',
  playerId: 'p-me',
  playerName: 'You',
  playedAt: '2026-09-29T10:00:00.000Z',
  score: 10,
  durationSeconds: 120,
  endReason: 'time',
  settings: SETTINGS,
  ...over,
});

describe('submit', () => {
  it('is idempotent: the same matchId never creates a second record', () => {
    const db = new MockDb(memoryStorage());
    const first = db.submit(rec());
    const again = db.submit(rec({ score: 999 }));
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.record.score).toBe(10);
    expect(db.confirmed).toHaveLength(1);
    expect(db.ranking(SETTINGS, 1, 100, { ...view, fixtures: false }).total).toBe(1);
    expect(db.history('p-me', 'You', 1, 100, view).total).toBe(1);
  });

  it('bumps the revision only for accepted writes', () => {
    const db = new MockDb(memoryStorage());
    const r0 = db.revision;
    db.submit(rec());
    expect(db.revision).toBe(r0 + 1);
    db.submit(rec());
    expect(db.revision).toBe(r0 + 1);
  });

  it('survives a reload through the storage adapter', () => {
    const storage = memoryStorage();
    new MockDb(storage).submit(rec());
    const reloaded = new MockDb(storage);
    expect(reloaded.confirmed).toHaveLength(1);
    expect(reloaded.submit(rec()).created).toBe(false);
  });

  it('reset restores the initial state', () => {
    const storage = memoryStorage();
    const db = new MockDb(storage);
    db.submit(rec());
    db.reset();
    expect(db.confirmed).toHaveLength(0);
    expect(db.revision).toBe(1);
    expect(new MockDb(storage).confirmed).toHaveLength(0);
  });
});

describe('ranking', () => {
  it('only compares matches with the same settings', () => {
    const db = new MockDb(memoryStorage());
    db.submit(rec({ matchId: 'a', settings: { sessionSeconds: 60, spawnInterval: 3 }, score: 500 }));
    const page = db.ranking(SETTINGS, 1, 100, view);
    expect(page.items.every((e) => e.settings.sessionSeconds === 120 && e.settings.spawnInterval === 3)).toBe(true);
    expect(page.items.some((e) => e.matchId === 'a')).toBe(false);
  });

  it('orders by score with a deterministic tiebreak and assigns consecutive ranks', () => {
    const db = new MockDb(memoryStorage());
    db.submit(rec({ matchId: 'z', score: 1000, endReason: 'death', playedAt: '2026-09-01T00:00:00.000Z' }));
    db.submit(rec({ matchId: 'y', score: 1000, endReason: 'time', playedAt: '2026-09-05T00:00:00.000Z' }));
    db.submit(rec({ matchId: 'x', score: 1000, endReason: 'time', playedAt: '2026-09-02T00:00:00.000Z' }));
    const top = db.ranking(SETTINGS, 1, 10, view).items.slice(0, 3);
    expect(top.map((e) => e.matchId)).toEqual(['x', 'y', 'z']); // time-ended first, then earliest
    expect(top.map((e) => e.rank)).toEqual([1, 2, 3]);
  });

  it('gives the same order for the same data every time', () => {
    const a = new MockDb(memoryStorage()).ranking(SETTINGS, 1, 100, view).items.map((e) => e.matchId);
    const b = new MockDb(memoryStorage()).ranking(SETTINGS, 1, 100, view).items.map((e) => e.matchId);
    expect(a).toEqual(b);
  });

  it('paginates with stable totals', () => {
    const db = new MockDb(memoryStorage());
    const p1 = db.ranking(SETTINGS, 1, 8, view);
    const p2 = db.ranking(SETTINGS, 2, 8, view);
    expect(p1.items).toHaveLength(8);
    expect(p1.total).toBe(p2.total);
    expect(p1.totalPages).toBe(Math.ceil(p1.total / 8));
    expect(new Set([...p1.items, ...p2.items].map((e) => e.matchId)).size).toBe(16);
  });

  it('is empty when fixtures are hidden and nothing was recorded', () => {
    const page = new MockDb(memoryStorage()).ranking(SETTINGS, 1, 8, { ...view, fixtures: false });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
    expect(page.totalPages).toBe(1);
  });

  it('ranking comparator is a strict total order', () => {
    const a = rec({ matchId: 'a' });
    const b = rec({ matchId: 'b' });
    expect(compareRanking(a, b)).toBeLessThan(0);
    expect(compareRanking(b, a)).toBeGreaterThan(0);
    expect(compareRanking(a, a)).toBe(0);
  });
});

describe('history', () => {
  it('lists only the given player, newest first', () => {
    const db = new MockDb(memoryStorage());
    db.submit(rec({ matchId: 'old', playedAt: '2026-09-01T00:00:00.000Z' }));
    db.submit(rec({ matchId: 'new', playedAt: '2026-09-28T00:00:00.000Z' }));
    db.submit(rec({ matchId: 'other', playerId: 'p-other' }));
    const page = db.history('p-me', 'You', 1, 10, view);
    expect(page.items.map((m) => m.matchId)).toEqual(['new', 'old']);
    const [first, second] = page.items;
    if (!first || !second) throw new Error('expected two matches');
    expect(compareHistory(first, second)).toBeLessThan(0);
  });

  it('adds a long synthetic history for the many-pages scenario', () => {
    const db = new MockDb(memoryStorage());
    const page = db.history('p-me', 'You', 1, 8, { ...view, syntheticHistory: true });
    expect(page.total).toBeGreaterThan(16);
    expect(page.items.every((m) => m.playerId === 'p-me')).toBe(true);
  });
});

describe('parseRecord', () => {
  it('accepts a valid record', () => {
    expect(typeof parseRecord(rec())).toBe('object');
  });

  it.each([
    ['not an object', 5],
    ['missing id', { ...rec(), matchId: '' }],
    ['negative score', { ...rec(), score: -1 }],
    ['fractional score', { ...rec(), score: 1.5 }],
    ['bad reason', { ...rec(), endReason: 'quit' }],
    ['bad date', { ...rec(), playedAt: 'yesterday' }],
    ['no settings', { ...rec(), settings: null }],
  ])('rejects %s', (_name, body) => {
    expect(typeof parseRecord(body)).toBe('string');
  });
});
