import { isRecord, readJson, removeKey, writeJson } from '../storage/localStore';

export type ScenarioId =
  | 'success'
  | 'empty'
  | 'paginated'
  | 'slow'
  | 'variable-latency'
  | 'out-of-order'
  | 'timeout'
  | 'network-error'
  | 'http-4xx'
  | 'http-5xx'
  | 'ranking-fails'
  | 'history-fails'
  | 'submit-timeout'
  | 'submit-unavailable'
  | 'submit-flaky';

export interface ScenarioInfo {
  id: ScenarioId;
  label: string;
  description: string;
}

export const SCENARIOS: readonly ScenarioInfo[] = [
  { id: 'success', label: 'Success', description: 'Everything works, with short latency.' },
  { id: 'empty', label: 'Empty lists', description: 'Ranking and history contain no records.' },
  { id: 'paginated', label: 'Many pages', description: 'Lots of ranking entries and history, so paging is exercised.' },
  { id: 'slow', label: 'Slow network', description: 'Every response takes about 2.5 seconds.' },
  { id: 'variable-latency', label: 'Variable latency', description: 'Response times jump between 0.1 and 3 seconds.' },
  { id: 'out-of-order', label: 'Out-of-order responses', description: 'Older requests answer after newer ones.' },
  { id: 'timeout', label: 'Timeout', description: 'Requests never get an answer.' },
  { id: 'network-error', label: 'Connection failure', description: 'Every request fails to connect.' },
  { id: 'http-4xx', label: 'HTTP 4xx', description: 'Lists answer 404 and submissions are rejected with 400.' },
  { id: 'http-5xx', label: 'HTTP 5xx', description: 'Every request answers 500.' },
  { id: 'ranking-fails', label: 'Ranking down', description: 'Only the ranking query fails (500).' },
  { id: 'history-fails', label: 'History down', description: 'Only the history query fails (500).' },
  { id: 'submit-timeout', label: 'Timeout after saving', description: 'The match is stored but the reply never arrives. Retrying must not duplicate it.' },
  { id: 'submit-unavailable', label: 'Recording unavailable', description: 'Saving a finished match fails (503) until you switch scenario, then retry.' },
  { id: 'submit-flaky', label: 'Flaky recording', description: 'Saving fails twice (503), then works.' },
] as const;

export interface MockSettings {
  scenario: ScenarioId;
  /** Seeds latency jitter so a run is reproducible. */
  seed: number;
  /** Multiplies every simulated latency. 0 removes it (used by tests). */
  latencyScale: number;
}

export const DEFAULT_MOCK_SETTINGS: MockSettings = { scenario: 'success', seed: 1, latencyScale: 1 };

const KEY = 'pirate-battle:mock-settings:v1';

const isScenario = (v: unknown): v is ScenarioId => SCENARIOS.some((s) => s.id === v);

export function loadMockSettings(): MockSettings {
  const raw = readJson(KEY);
  if (!isRecord(raw)) return { ...DEFAULT_MOCK_SETTINGS };
  return {
    scenario: isScenario(raw.scenario) ? raw.scenario : DEFAULT_MOCK_SETTINGS.scenario,
    seed: typeof raw.seed === 'number' && Number.isFinite(raw.seed) ? raw.seed : DEFAULT_MOCK_SETTINGS.seed,
    latencyScale: typeof raw.latencyScale === 'number' && raw.latencyScale >= 0 ? raw.latencyScale : DEFAULT_MOCK_SETTINGS.latencyScale,
  };
}

export function saveMockSettings(settings: MockSettings): void {
  writeJson(KEY, settings);
}

export function clearMockSettings(): void {
  removeKey(KEY);
}

/**
 * URL parameters make a run reproducible without touching the UI, e.g. `?scenario=slow&seed=7&latency=0`.
 * They are applied once at startup and persisted like a normal selection.
 */
export function applyUrlOverrides(search: string): MockSettings {
  const params = new URLSearchParams(search);
  const current = loadMockSettings();
  const scenario = params.get('scenario');
  const seed = params.get('seed');
  const latency = params.get('latency');
  const next: MockSettings = {
    scenario: isScenario(scenario) ? scenario : current.scenario,
    seed: seed !== null && Number.isFinite(Number(seed)) ? Number(seed) : current.seed,
    latencyScale: latency !== null && Number.isFinite(Number(latency)) && Number(latency) >= 0 ? Number(latency) : current.latencyScale,
  };
  if (scenario !== null || seed !== null || latency !== null) saveMockSettings(next);
  return next;
}
