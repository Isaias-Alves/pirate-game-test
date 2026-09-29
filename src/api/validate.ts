import type { MatchRecord } from './contracts';
import { isRecord } from '../storage/localStore';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/** Validates an untrusted POST body. Returns the record, or a message describing what is wrong. */
export function parseRecord(body: unknown): MatchRecord | string {
  if (!isRecord(body)) return 'Body must be a JSON object.';
  const { matchId, playerId, playerName, playedAt, score, durationSeconds, endReason, settings } = body;
  if (!isStr(matchId) || matchId.length > 80) return 'matchId is required.';
  if (!isStr(playerId) || !isStr(playerName)) return 'playerId and playerName are required.';
  if (!isStr(playedAt) || Number.isNaN(Date.parse(playedAt))) return 'playedAt must be an ISO date.';
  if (!isNum(score) || !Number.isInteger(score) || score < 0) return 'score must be a non-negative integer.';
  if (!isNum(durationSeconds) || durationSeconds < 0) return 'durationSeconds must be a non-negative number.';
  if (endReason !== 'time' && endReason !== 'death') return 'endReason must be "time" or "death".';
  if (!isRecord(settings) || !isNum(settings.sessionSeconds) || !isNum(settings.spawnInterval)) return 'settings are required.';
  return {
    matchId,
    playerId,
    playerName,
    playedAt,
    score,
    durationSeconds,
    endReason,
    settings: { sessionSeconds: settings.sessionSeconds, spawnInterval: settings.spawnInterval },
  };
}
