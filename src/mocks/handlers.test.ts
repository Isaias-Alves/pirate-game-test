import { isAxiosError } from 'axios';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { MatchRecord } from '../api/contracts';
import { fetchHistory, fetchRanking, submitMatch } from '../api/endpoints';
import { http } from '../api/http';
import { db, handlers, resetMocks } from './handlers';

// Node has no page origin, so point the shared Axios instance at an absolute base.
http.defaults.baseURL = 'http://localhost/api';
http.defaults.timeout = 500;

const server = setupServer(...handlers);
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  resetMocks();
});
afterAll(() => {
  server.close();
});

const SETTINGS = { sessionSeconds: 120, spawnInterval: 3 };
const rec = (over: Partial<MatchRecord> = {}): MatchRecord => ({
  matchId: 'api-1',
  playerId: 'p-test',
  playerName: 'You',
  playedAt: '2026-09-29T10:00:00.000Z',
  score: 12,
  durationSeconds: 120,
  endReason: 'time',
  settings: SETTINGS,
  ...over,
});

// resetMocks() clears the scenario, so latency is the default 120-300 ms; keep tests quick by using
// the seed-controlled default rather than waiting on anything longer.
describe('mock API contract', () => {
  it('submits once and replays idempotently (201 then 200, one record)', async () => {
    const first = await submitMatch(rec());
    const again = await submitMatch(rec());
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    // The reply says where the match landed in the ranking for its setup (same answer on replay).
    expect(first.rank).toBeGreaterThan(0);
    expect(first.rank).toBeLessThanOrEqual(first.rankedOf);
    expect(again.rank).toBe(first.rank);
    expect(again.record.matchId).toBe('api-1');
    expect(db.confirmed).toHaveLength(1);
    const history = await fetchHistory({ playerId: 'p-test', page: 1 });
    expect(history.total).toBe(1);
    const ranking = await fetchRanking({ ...SETTINGS, page: 1, pageSize: 100 });
    expect(ranking.items.filter((e) => e.matchId === 'api-1')).toHaveLength(1);
  });

  it('rejects an invalid record with 400', async () => {
    await expect(submitMatch(rec({ score: -5 }))).rejects.toSatisfy((e: unknown) => isAxiosError(e) && e.response?.status === 400);
  });

  it('returns ranked, paginated results ordered by score', async () => {
    const page1 = await fetchRanking({ ...SETTINGS, page: 1, pageSize: 5 });
    const page2 = await fetchRanking({ ...SETTINGS, page: 2, pageSize: 5 });
    expect(page1.items).toHaveLength(5);
    expect(page1.items.map((e) => e.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(page2.items[0]?.rank).toBe(6);
    const scores = [...page1.items, ...page2.items].map((e) => e.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });

  it('rejects a bad page with 400', async () => {
    await expect(fetchRanking({ ...SETTINGS, page: 0 })).rejects.toSatisfy((e: unknown) => isAxiosError(e) && e.response?.status === 400);
  });
});
