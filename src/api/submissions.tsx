import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { MatchResult } from '../game/matchStore';
import { getPlayer } from '../storage/player';
import { submitMatch } from './endpoints';
import { describeError } from './http';
import { loadPending, savePending, toRecord } from './pending';
import { retryDelay, shouldRetry } from './queryClient';
import { SubmissionsContext, type Submission, type SubmissionsApi } from './submissionsContext';

/**
 * Owns the lifecycle of match records: persist first, send with TanStack Query's mutation (retrying
 * transient failures), confirm, then refresh both lists. Because the server treats `matchId` as an
 * idempotency key, resending after a timeout or reload can never create a duplicate.
 */
export function SubmissionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({ mutationFn: submitMatch, retry: shouldRetry, retryDelay });
  const { mutateAsync } = mutation;

  const [submissions, setSubmissions] = useState<Record<string, Submission>>(() =>
    Object.fromEntries(loadPending().map((record) => [record.matchId, { record, status: 'failed' as const }])),
  );
  /** Mirror of the state for synchronous reads (double clicks, Strict Mode re-runs). */
  const latest = useRef(submissions);
  const inflight = useRef(new Map<string, Promise<void>>());

  const commit = useCallback((next: Record<string, Submission>) => {
    latest.current = next;
    setSubmissions(next);
    savePending(Object.values(next).filter((s) => s.status !== 'confirmed').map((s) => s.record));
  }, []);

  const update = useCallback(
    (matchId: string, patch: Partial<Submission>) => {
      const current = latest.current[matchId];
      if (!current) return;
      commit({ ...latest.current, [matchId]: { ...current, ...patch } });
    },
    [commit],
  );

  const send = useCallback(
    (matchId: string): void => {
      const entry = latest.current[matchId];
      if (!entry || entry.status === 'confirmed' || inflight.current.has(matchId)) return;

      commit({ ...latest.current, [matchId]: { record: entry.record, status: 'sending' } });

      const job = mutateAsync(entry.record).then(
        () => {
          update(matchId, { status: 'confirmed' });
          // Both lists changed: refresh whatever is cached, cancelling any older in-flight fetch.
          void queryClient.invalidateQueries({ queryKey: ['ranking'] });
          void queryClient.invalidateQueries({ queryKey: ['history'] });
        },
        (error: unknown) => {
          update(matchId, { status: 'failed', error: describeError(error) });
        },
      );
      inflight.current.set(matchId, job);
      void job.finally(() => {
        inflight.current.delete(matchId);
      });
    },
    [commit, mutateAsync, queryClient, update],
  );

  const enqueue = useCallback(
    (result: MatchResult) => {
      if (latest.current[result.matchId]) return;
      const record = toRecord(result, getPlayer());
      commit({ ...latest.current, [record.matchId]: { record, status: 'failed' } });
      send(record.matchId);
    },
    [commit, send],
  );

  const retryAll = useCallback(() => {
    for (const s of Object.values(latest.current)) if (s.status === 'failed') send(s.record.matchId);
  }, [send]);

  const clearPending = useCallback(() => {
    commit(Object.fromEntries(Object.entries(latest.current).filter(([, s]) => s.status === 'confirmed')));
  }, [commit]);

  // After a reload, matches that were not confirmed get one automatic attempt.
  useEffect(() => {
    retryAll();
  }, [retryAll]);

  const api = useMemo<SubmissionsApi>(
    () => ({
      submissions,
      pending: Object.values(submissions).filter((s) => s.status !== 'confirmed'),
      enqueue,
      retry: send,
      retryAll,
      clearPending,
    }),
    [submissions, enqueue, send, retryAll, clearPending],
  );

  return <SubmissionsContext.Provider value={api}>{children}</SubmissionsContext.Provider>;
}
