import { HttpResponse, delay, http } from 'msw';
import { DEFAULT_PAGE_SIZE, type ApiErrorBody, type SubmitResponse } from '../api/contracts';
import { PLAYER_NAME } from '../storage/player';
import { readJson, removeKey, writeJson } from '../storage/localStore';
import { createRng } from '../game/sim/rng';
import { parseRecord } from '../api/validate';
import { MockDb, type DataView, type DbStorage, type StoredDb } from './db';
import { clearMockSettings, loadMockSettings, type ScenarioId } from './scenarios';

const DB_KEY = 'pirate-battle:mock-db:v1';

const localStorageAdapter: DbStorage = {
  read: () => readJson(DB_KEY),
  write: (state: StoredDb) => void writeJson(DB_KEY, state),
  clear: () => {
    removeKey(DB_KEY);
  },
};

export const db = new MockDb(localStorageAdapter);

/** Per-session counters that make scenarios deterministic. They restart on reload and on reset. */
const runtime = { requests: 0, flakyFailures: 0 };

/** Restores the mock backend to its initial state: no confirmed matches, default scenario, fresh counters. */
export function resetMocks(): void {
  db.reset();
  clearMockSettings();
  runtime.requests = 0;
  runtime.flakyFailures = 0;
}

type Kind = 'ranking' | 'history' | 'submit';

const error = (status: number, code: string, message: string) => HttpResponse.json<ApiErrorBody>({ error: code, message }, { status });

function latencyMs(scenario: ScenarioId, n: number, seed: number): number {
  const rng = createRng(seed * 7919 + n);
  switch (scenario) {
    case 'slow':
      return 2500;
    case 'variable-latency':
      return 100 + rng() * 2900;
    // Each new request is faster than the one before it, so older answers land after newer ones.
    case 'out-of-order':
      return Math.max(60, 1800 - n * 600);
    default:
      return 120 + rng() * 180;
  }
}

function viewFor(scenario: ScenarioId): DataView {
  return { fixtures: scenario !== 'empty', extraFixtures: scenario === 'paginated', syntheticHistory: scenario === 'paginated' };
}

/**
 * Applies the active scenario to one request: waits the simulated latency, then either returns a failure
 * response or `undefined` to let the real handler answer.
 */
async function applyScenario(kind: Kind): Promise<{ failure?: Response; scenario: ScenarioId }> {
  const settings = loadMockSettings();
  const n = runtime.requests++;
  const { scenario } = settings;

  const wait = latencyMs(scenario, n, settings.seed) * settings.latencyScale;
  if (wait > 0) await delay(wait);

  if (scenario === 'timeout') await delay('infinite');
  if (scenario === 'network-error') return { failure: HttpResponse.error(), scenario };
  if (scenario === 'http-5xx') return { failure: error(500, 'server_error', 'Something broke on our side.'), scenario };
  if (scenario === 'http-4xx') {
    return { failure: kind === 'submit' ? error(400, 'bad_request', 'Request rejected.') : error(404, 'not_found', 'Nothing here.'), scenario };
  }
  if (scenario === 'ranking-fails' && kind === 'ranking') return { failure: error(500, 'server_error', 'Ranking is down.'), scenario };
  if (scenario === 'history-fails' && kind === 'history') return { failure: error(500, 'server_error', 'History is down.'), scenario };
  if (kind === 'submit') {
    if (scenario === 'submit-unavailable') return { failure: error(503, 'unavailable', 'Recording is unavailable.'), scenario };
    if (scenario === 'submit-flaky' && runtime.flakyFailures < 2) {
      runtime.flakyFailures += 1;
      return { failure: error(503, 'unavailable', 'Recording is unavailable.'), scenario };
    }
  }
  return { scenario };
}

const positiveInt = (raw: string | null, fallback: number, max: number): number | undefined => {
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : undefined;
};

export const handlers = [
  http.get('*/api/ranking', async ({ request }) => {
    const { failure, scenario } = await applyScenario('ranking');
    if (failure) return failure;
    const q = new URL(request.url).searchParams;
    const page = positiveInt(q.get('page'), 1, 10_000);
    const pageSize = positiveInt(q.get('pageSize'), DEFAULT_PAGE_SIZE, 100);
    const sessionSeconds = Number(q.get('sessionSeconds'));
    const spawnInterval = Number(q.get('spawnInterval'));
    if (page === undefined || pageSize === undefined || !Number.isFinite(sessionSeconds) || !Number.isFinite(spawnInterval)) {
      return error(400, 'bad_request', 'Invalid ranking query.');
    }
    return HttpResponse.json(db.ranking({ sessionSeconds, spawnInterval }, page, pageSize, viewFor(scenario)));
  }),

  http.get('*/api/players/:playerId/matches', async ({ request, params }) => {
    const { failure, scenario } = await applyScenario('history');
    if (failure) return failure;
    const q = new URL(request.url).searchParams;
    const page = positiveInt(q.get('page'), 1, 10_000);
    const pageSize = positiveInt(q.get('pageSize'), DEFAULT_PAGE_SIZE, 100);
    const playerId = typeof params.playerId === 'string' ? params.playerId : '';
    if (page === undefined || pageSize === undefined || playerId === '') return error(400, 'bad_request', 'Invalid history query.');
    return HttpResponse.json(db.history(decodeURIComponent(playerId), PLAYER_NAME, page, pageSize, viewFor(scenario)));
  }),

  http.post('*/api/matches', async ({ request }) => {
    const { failure, scenario } = await applyScenario('submit');
    if (failure) return failure;
    const body: unknown = await request.json().catch(() => undefined);
    const record = parseRecord(body);
    if (typeof record === 'string') return error(400, 'bad_request', record);

    const result = db.submit(record);
    // The match is stored, but the reply is lost: the client must retry and get the same record back.
    if (scenario === 'submit-timeout') await delay('infinite');

    const payload: SubmitResponse = { record: result.record, created: result.created, revision: db.revision };
    return HttpResponse.json(payload, { status: result.created ? 201 : 200 });
  }),
];
