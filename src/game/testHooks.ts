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
