import { readJson, writeJson } from './localStore';

const KEY = 'pirate-battle:sound:v1';

/** Sound is on unless the player turned it off; the choice survives reloads. */
export function loadMuted(): boolean {
  const raw = readJson(KEY);
  return typeof raw === 'object' && raw !== null && 'muted' in raw && raw.muted === true;
}

export function saveMuted(muted: boolean): void {
  writeJson(KEY, { muted });
}
