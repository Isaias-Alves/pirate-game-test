import { gameConfig, type GameConfig } from '../game/gameConfig';
import { isRecord, readJson, writeJson } from './localStore';

/** Player-adjustable settings. Everything else comes from gameConfig. */
export interface Options {
  /** Active play time per match, in seconds. */
  sessionSeconds: number;
  /** Seconds between enemy spawns. */
  spawnInterval: number;
}

export const OPTION_LIMITS = {
  sessionSeconds: { min: gameConfig.session.minDuration, max: gameConfig.session.maxDuration },
  spawnInterval: { min: gameConfig.spawn.minInterval, max: gameConfig.spawn.maxInterval },
} as const;

export const DEFAULT_OPTIONS: Options = {
  sessionSeconds: gameConfig.session.duration,
  spawnInterval: gameConfig.spawn.interval,
};

const KEY = 'pirate-battle:options:v1';

export type OptionErrors = Partial<Record<keyof Options, string>>;

/** Validates raw form text. `values` are what the player typed; errors are user-facing (English UI). */
export function validateOptions(values: { sessionSeconds: string; spawnInterval: string }): { options?: Options; errors: OptionErrors } {
  const errors: OptionErrors = {};
  const { sessionSeconds: s, spawnInterval: i } = OPTION_LIMITS;

  const session = values.sessionSeconds.trim() === '' ? NaN : Number(values.sessionSeconds);
  if (!Number.isFinite(session)) errors.sessionSeconds = 'Enter a number of seconds.';
  else if (!Number.isInteger(session)) errors.sessionSeconds = 'Use whole seconds.';
  else if (session < s.min || session > s.max) errors.sessionSeconds = `Choose between ${String(s.min)} and ${String(s.max)} seconds.`;

  const spawn = values.spawnInterval.trim() === '' ? NaN : Number(values.spawnInterval);
  if (!Number.isFinite(spawn)) errors.spawnInterval = 'Enter a number of seconds.';
  else if (spawn < i.min || spawn > i.max) errors.spawnInterval = `Choose between ${String(i.min)} and ${String(i.max)} seconds.`;

  if (errors.sessionSeconds || errors.spawnInterval) return { errors };
  return { options: { sessionSeconds: session, spawnInterval: spawn }, errors };
}

/** Loads saved options; any missing/invalid field falls back to its default. */
export function loadOptions(): Options {
  const raw = readJson(KEY);
  if (!isRecord(raw)) return { ...DEFAULT_OPTIONS };
  const check = validateOptions({ sessionSeconds: String(raw.sessionSeconds), spawnInterval: String(raw.spawnInterval) });
  return {
    sessionSeconds: check.errors.sessionSeconds ? DEFAULT_OPTIONS.sessionSeconds : Number(raw.sessionSeconds),
    spawnInterval: check.errors.spawnInterval ? DEFAULT_OPTIONS.spawnInterval : Number(raw.spawnInterval),
  };
}

export function saveOptions(options: Options): boolean {
  return writeJson(KEY, options);
}

/** Immutable snapshot of the config for one match, taken when the match starts. */
export function matchConfig(options: Options): GameConfig {
  return {
    ...gameConfig,
    session: { ...gameConfig.session, duration: options.sessionSeconds },
    spawn: { ...gameConfig.spawn, interval: options.spawnInterval },
  };
}
