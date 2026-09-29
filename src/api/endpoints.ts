import { DEFAULT_PAGE_SIZE, type MatchRecord, type MatchSettings, type Page, type RankingEntry, type SubmitResponse } from './contracts';
import { http } from './http';

export interface RankingParams extends MatchSettings {
  page: number;
  pageSize?: number;
}

export async function fetchRanking(params: RankingParams, signal?: AbortSignal): Promise<Page<RankingEntry>> {
  const { data } = await http.get<Page<RankingEntry>>('/ranking', {
    params: { ...params, pageSize: params.pageSize ?? DEFAULT_PAGE_SIZE },
    ...(signal ? { signal } : {}),
  });
  return data;
}

export interface HistoryParams {
  playerId: string;
  page: number;
  pageSize?: number;
}

export async function fetchHistory({ playerId, page, pageSize }: HistoryParams, signal?: AbortSignal): Promise<Page<MatchRecord>> {
  const { data } = await http.get<Page<MatchRecord>>(`/players/${encodeURIComponent(playerId)}/matches`, {
    params: { page, pageSize: pageSize ?? DEFAULT_PAGE_SIZE },
    ...(signal ? { signal } : {}),
  });
  return data;
}

/** Idempotent: re-sending the same `matchId` returns the existing record instead of creating another. */
export async function submitMatch(record: MatchRecord): Promise<SubmitResponse> {
  const { data } = await http.post<SubmitResponse>('/matches', record);
  return data;
}
