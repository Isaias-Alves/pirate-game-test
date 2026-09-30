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

/** What the active scenario will do to one request. Decided on arrival; nothing here waits. */
interface Plan {
  scenario: ScenarioId;
  waitMs: number;
  /** Answer with this instead of the real payload. */
  failure?: Response;
  /** Never answer at all (the client times out). */
  hang: boolean;
}

function planRequest(kind: Kind): Plan {
  const settings = loadMockSettings();
  const n = runtime.requests++;
  const { scenario } = settings;
  const plan: Plan = { scenario, waitMs: latencyMs(scenario, n, settings.seed) * settings.latencyScale, hang: scenario === 'timeout' };

  if (scenario === 'network-error') plan.failure = HttpResponse.error();
  else if (scenario === 'http-5xx') plan.failure = error(500, 'server_error', 'Something broke on our side.');
  else if (scenario === 'http-4xx') plan.failure = kind === 'submit' ? error(400, 'bad_request', 'Request rejected.') : error(404, 'not_found', 'Nothing here.');
  else if (scenario === 'ranking-fails' && kind === 'ranking') plan.failure = error(500, 'server_error', 'Ranking is down.');
  else if (scenario === 'history-fails' && kind === 'history') plan.failure = error(500, 'server_error', 'History is down.');
  else if (kind === 'submit' && scenario === 'submit-unavailable') plan.failure = error(503, 'unavailable', 'Recording is unavailable.');
  else if (kind === 'submit' && scenario === 'submit-flaky' && runtime.flakyFailures < 2) {
    runtime.flakyFailures += 1;
    plan.failure = error(503, 'unavailable', 'Recording is unavailable.');
  }
  return plan;
}

/** Waits out the simulated latency, then returns the failure to send (undefined = send the real payload). */
async function settle(plan: Plan): Promise<Response | undefined> {
  if (plan.waitMs > 0) await delay(plan.waitMs);
  if (plan.hang) await delay('infinite');
  return plan.failure;
}

const positiveInt = (raw: string | null, fallback: number, max: number): number | undefined => {
  if (raw === null) return fallback;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : undefined;
};

/**
 * Reads are answered from the data as it is when the request ARRIVES, then delayed: a slow response is a
 * genuinely stale snapshot, exactly like a real slow network. That is what makes out-of-order scenarios real.
 */
export const handlers = [
  http.get('*/api/ranking', async ({ request }) => {
    const plan = planRequest('ranking');
    const q = new URL(request.url).searchParams;
    const page = positiveInt(q.get('page'), 1, 10_000);
    const pageSize = positiveInt(q.get('pageSize'), DEFAULT_PAGE_SIZE, 100);
    const sessionSeconds = Number(q.get('sessionSeconds'));
    const spawnInterval = Number(q.get('spawnInterval'));
    const invalid = page === undefined || pageSize === undefined || !Number.isFinite(sessionSeconds) || !Number.isFinite(spawnInterval);
    const answer = invalid
      ? error(400, 'bad_request', 'Invalid ranking query.')
      : HttpResponse.json(db.ranking({ sessionSeconds, spawnInterval }, page, pageSize, viewFor(plan.scenario)));
    return (await settle(plan)) ?? answer;
  }),

  http.get('*/api/players/:playerId/matches', async ({ request, params }) => {
    const plan = planRequest('history');
    const q = new URL(request.url).searchParams;
    const page = positiveInt(q.get('page'), 1, 10_000);
    const pageSize = positiveInt(q.get('pageSize'), DEFAULT_PAGE_SIZE, 100);
    const playerId = typeof params.playerId === 'string' ? params.playerId : '';
    const answer =
      page === undefined || pageSize === undefined || playerId === ''
        ? error(400, 'bad_request', 'Invalid history query.')
        : HttpResponse.json(db.history(decodeURIComponent(playerId), PLAYER_NAME, page, pageSize, viewFor(plan.scenario)));
    return (await settle(plan)) ?? answer;
  }),

  http.post('*/api/matches', async ({ request }) => {
    const plan = planRequest('submit');
    // A failing or hanging server never stored anything.
    if (plan.failure || plan.hang) return (await settle(plan)) ?? error(500, 'server_error', 'Unreachable');

    const body: unknown = await request.json().catch(() => undefined);
    const record = parseRecord(body);
    if (typeof record === 'string') return (await settle(plan)) ?? error(400, 'bad_request', record);

    const result = db.submit(record);
    // The match is stored, but the reply is lost: the client must retry and get the same record back.
    if (plan.scenario === 'submit-timeout') plan.hang = true;

    const payload: SubmitResponse = { record: result.record, created: result.created, revision: db.revision, ...db.rankOf(result.record, viewFor(plan.scenario)) };
    return (await settle(plan)) ?? HttpResponse.json(payload, { status: result.created ? 201 : 200 });
  }),
];
