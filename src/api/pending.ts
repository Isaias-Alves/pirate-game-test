import type { MatchResult } from '../game/matchStore';
import { isRecord, readJson, writeJson } from '../storage/localStore';
import type { Player } from '../storage/player';
import type { MatchRecord } from './contracts';
import { parseRecord } from './validate';

const KEY = 'pirate-battle:pending:v1';

/** Builds the API record for a finished match. The `matchId` from the game is the idempotency key. */
export function toRecord(result: MatchResult, player: Player): MatchRecord {
  return {
    matchId: result.matchId,
    playerId: player.id,
    playerName: player.name,
    playedAt: result.endedAt,
    score: result.score,
    durationSeconds: Math.round(result.playedSeconds * 10) / 10,
    endReason: result.endReason,
    settings: { sessionSeconds: result.settings.sessionSeconds, spawnInterval: result.settings.spawnInterval },
  };
}

/** Matches finished but not yet confirmed by the server. Survives reloads. */
export function loadPending(): MatchRecord[] {
  const raw = readJson(KEY);
  if (!Array.isArray(raw)) return [];
  return raw.map((r: unknown) => (isRecord(r) ? parseRecord(r) : 'invalid')).filter((r): r is MatchRecord => typeof r !== 'string');
}

export function savePending(records: readonly MatchRecord[]): void {
  writeJson(KEY, records);
}
