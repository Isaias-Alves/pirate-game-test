import { DEFAULT_PAGE_SIZE, type MatchRecord, type MatchSettings, type Page, type RankingEntry, type SubmitResponse } from './contracts';
import { http } from './http';

/**
 * Anything that is not the documented shape (an HTML fallback page, a proxy error body, a partial payload)
 * must surface as a failed request, not crash the UI later on `undefined.items`.
 */
function isPage<T>(data: unknown): data is Page<T> {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return (
    Array.isArray(d.items) &&
    typeof d.page === 'number' &&
    typeof d.pageSize === 'number' &&
    typeof d.total === 'number' &&
    typeof d.totalPages === 'number' &&
    typeof d.revision === 'number'
  );
}

function expectPage<T>(data: unknown): Page<T> {
  if (!isPage<T>(data)) throw new Error('Unexpected response from the server.');
  return data;
}

export interface RankingParams extends MatchSettings {
  page: number;
  pageSize?: number;
}

export async function fetchRanking(params: RankingParams, signal?: AbortSignal): Promise<Page<RankingEntry>> {
  const { data } = await http.get<unknown>('/ranking', {
    params: { ...params, pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE },
    ...(signal ? { signal } : {}),
  });
  return expectPage<RankingEntry>(data);
}

export interface HistoryParams {
  playerId: string;
  page: number;
  pageSize?: number;
}

export async function fetchHistory({ playerId, page, pageSize }: HistoryParams, signal?: AbortSignal): Promise<Page<MatchRecord>> {
  const { data } = await http.get<unknown>(`/players/${encodeURIComponent(playerId)}/matches`, {
    params: { page, pageSize: pageSize ?? DEFAULT_PAGE_SIZE },
    ...(signal ? { signal } : {}),
  });
  return expectPage<MatchRecord>(data);
}

/** Idempotent: re-sending the same `matchId` returns the existing record instead of creating another. */
export async function submitMatch(record: MatchRecord): Promise<SubmitResponse> {
  const { data } = await http.post<unknown>('/matches', record);
  if (typeof data !== 'object' || data === null || !('record' in data) || !('created' in data) || !('rank' in data) || !('rankedOf' in data)) {
    throw new Error('Unexpected response from the server.');
  }
  return data as SubmitResponse;
}
