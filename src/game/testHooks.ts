import type { Game } from './Game';

declare global {
  interface Window {
    /** Test/debug handle to the running game. Only present in dev or when built with VITE_E2E=1. */
    __game?: Game | undefined;
  }
}

const enabled = import.meta.env.DEV || import.meta.env.VITE_E2E === '1';

export function exposeGame(game: Game | undefined): void {
  if (enabled) window.__game = game;
}

export interface TestOptions {
  /** Seed for the simulation's random generator (`?gameSeed=7`), so spawns are reproducible. */
  gameSeed: number | undefined;
  /** `?clock=manual`: the real-time ticker no longer advances the simulation; only `game.advance()` does. */
  manualClock: boolean;
}

/** Reads test-only URL switches. They are ignored unless the test hooks are enabled (never in a normal production build). */
export function readTestOptions(search: string = window.location.search): TestOptions {
  if (!enabled) return { gameSeed: undefined, manualClock: false };
  const params = new URLSearchParams(search);
  const seed = params.get('gameSeed');
  return {
    gameSeed: seed !== null && Number.isFinite(Number(seed)) ? Number(seed) : undefined,
    manualClock: params.get('clock') === 'manual',
  };
}
