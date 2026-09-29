import { useSyncExternalStore } from 'react';
import type { Game } from '../game/Game';
import type { MatchSnapshot } from '../game/matchStore';

/** Subscribes a component to the match store. Re-renders only when a visible value changes. */
export function useMatch(game: Game): MatchSnapshot {
  return useSyncExternalStore(game.store.subscribe, game.store.getSnapshot);
}
