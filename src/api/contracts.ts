/**
 * Typed REST contracts for the ranking and match-history APIs. Shared by the Axios client, the TanStack
 * Query hooks and the MSW handlers, so a contract change is a compile error everywhere.
 *
 *   GET  /api/ranking?sessionSeconds&spawnInterval&page&pageSize   -> Page<RankingEntry>
 *   GET  /api/players/:playerId/matches?page&pageSize              -> Page<MatchRecord>
 *   POST /api/matches   (body: MatchRecord)                        -> 201 Created | 200 already recorded (+ rank)
 */

export type EndReason = 'time' | 'death';

/** The two player-adjustable settings a match ran with. Ranking only compares matches with identical settings. */
export interface MatchSettings {
  sessionSeconds: number;
  spawnInterval: number;
}

export interface MatchRecord {
  /** Client-generated UUID; the idempotency key. Submitting the same id twice never creates a second record. */
  matchId: string;
  playerId: string;
  playerName: string;
  /** ISO-8601 timestamp of when the match ended. */
  playedAt: string;
  score: number;
  /** Effective active play time in seconds. */
  durationSeconds: number;
  endReason: EndReason;
  settings: MatchSettings;
}

export interface RankingEntry extends MatchRecord {
  /** 1-based position among matches with the same settings. */
  rank: number;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /**
   * Monotonic version of the server data. Bumped by every accepted write. Clients ignore a page whose
   * revision is older than one they already hold, so a late response can never overwrite newer data.
   */
  revision: number;
}

export interface SubmitResponse {
  record: MatchRecord;
  /** True when this call created the record, false when it already existed (idempotent replay). */
  created: boolean;
  revision: number;
  /** 1-based position of this match in the ranking for its setup, and how many matches that ranking holds. */
  rank: number;
  rankedOf: number;
}

export interface ApiErrorBody {
  error: string;
  message: string;
}

export const DEFAULT_PAGE_SIZE = 8;
