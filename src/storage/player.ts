import { newId } from './ids';
import { readJson, writeJson } from './localStore';

export interface Player {
  id: string;
  name: string;
}

const KEY = 'pirate-battle:player:v1';
export const PLAYER_NAME = 'You';

/** The local player's identity: created on first use and kept in localStorage. */
export function getPlayer(): Player {
  const raw = readJson(KEY);
  if (typeof raw === 'object' && raw !== null && 'id' in raw && typeof raw.id === 'string' && raw.id !== '') {
    return { id: raw.id, name: PLAYER_NAME };
  }
  const player = { id: `player-${newId()}`, name: PLAYER_NAME };
  writeJson(KEY, { id: player.id });
  return player;
}
