import type { MatchResult } from '../game/matchStore';
import { isRecord, readJson, writeJson } from './localStore';

const KEY = 'pirate-battle:last-result:v1';

/** Persists the last completed match so the menu can show it after a refresh. Abandoned matches are never saved. */
export function saveLastResult(result: MatchResult): boolean {
  return writeJson(KEY, result);
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function loadLastResult(): MatchResult | undefined {
  const raw = readJson(KEY);
  if (!isRecord(raw) || !isRecord(raw.settings)) return undefined;
  const { matchId, score, playedSeconds, endReason, endedAt, settings } = raw;
  if (
    typeof matchId !== 'string' ||
    !isNum(score) ||
    !isNum(playedSeconds) ||
    (endReason !== 'time' && endReason !== 'death') ||
    typeof endedAt !== 'string' ||
    !isNum(settings.sessionSeconds) ||
    !isNum(settings.spawnInterval)
  ) {
    return undefined;
  }
  return { matchId, score, playedSeconds, endReason, endedAt, settings: { sessionSeconds: settings.sessionSeconds, spawnInterval: settings.spawnInterval } };
}
