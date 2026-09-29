import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { MatchSettings } from './contracts';
import { fetchHistory, fetchRanking } from './endpoints';

const hasRevision = (v: unknown): v is { revision: number } => typeof v === 'object' && v !== null && 'revision' in v && typeof v.revision === 'number';

/**
 * Stale-response guard. Every page carries the server's `revision`; if a response arrives that is OLDER than
 * the data already cached for that query (e.g. a slow request finishing after a newer one), the cached data
 * is kept. Combined with query cancellation on invalidation, a late answer can never overwrite newer data.
 */
export function newestWins(oldData: unknown, newData: unknown): unknown {
  return hasRevision(oldData) && hasRevision(newData) && oldData.revision > newData.revision ? oldData : newData;
}

export const rankingKey = (s: MatchSettings, page: number) => ['ranking', s.sessionSeconds, s.spawnInterval, page] as const;
export const historyKey = (playerId: string, page: number) => ['history', playerId, page] as const;

export function useRanking(settings: MatchSettings, page: number) {
  return useQuery({
    queryKey: rankingKey(settings, page),
    queryFn: ({ signal }) => fetchRanking({ ...settings, page }, signal),
    placeholderData: keepPreviousData,
    structuralSharing: newestWins,
  });
}

export function useHistory(playerId: string, page: number) {
  return useQuery({
    queryKey: historyKey(playerId, page),
    queryFn: ({ signal }) => fetchHistory({ playerId, page }, signal),
    placeholderData: keepPreviousData,
    structuralSharing: newestWins,
  });
}
