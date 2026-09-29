import { createContext, useContext } from 'react';
import type { MatchResult } from '../game/matchStore';
import type { MatchRecord } from './contracts';

export type SubmissionStatus = 'sending' | 'confirmed' | 'failed';

export interface Submission {
  record: MatchRecord;
  status: SubmissionStatus;
  /** User-facing reason for the last failure. */
  error?: string;
}

export interface SubmissionsApi {
  submissions: Record<string, Submission>;
  /** Unconfirmed matches (sending or failed), oldest first. */
  pending: Submission[];
  /** Stores a finished match durably, then sends it. Safe to call twice with the same result. */
  enqueue: (result: MatchResult) => void;
  /** Re-sends one unconfirmed match. Ignored while that match is already being sent. */
  retry: (matchId: string) => void;
  retryAll: () => void;
  /** Forgets every unconfirmed match (used by "reset mocks"). */
  clearPending: () => void;
}

export const SubmissionsContext = createContext<SubmissionsApi | null>(null);

export function useSubmissions(): SubmissionsApi {
  const api = useContext(SubmissionsContext);
  if (!api) throw new Error('useSubmissions must be used inside <SubmissionProvider>');
  return api;
}
