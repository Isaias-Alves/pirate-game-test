import type { EndReason } from './sim/Simulation';

export type MatchPhase = 'playing' | 'paused' | 'ended';

/** What the React UI is allowed to see of a running match. Replaced (not mutated) when a value changes. */
export interface MatchSnapshot {
  phase: MatchPhase;
  score: number;
  /** Whole seconds remaining, rounded up so the HUD never shows 0 while play is still active. */
  timeLeft: number;
  health: number;
  maxHealth: number;
  endReason: EndReason | null;
  /** Why the match is paused, so the pause dialog can explain an automatic pause. */
  pauseCause: 'manual' | 'focus' | null;
}

export interface MatchResult {
  score: number;
  /** Active play time in seconds. */
  playedSeconds: number;
  endReason: EndReason;
  /** The configuration the match ran with (snapshot taken at start). */
  settings: { sessionSeconds: number; spawnInterval: number };
  endedAt: string;
}

export const initialSnapshot: MatchSnapshot = {
  phase: 'playing',
  score: 0,
  timeLeft: 0,
  health: 0,
  maxHealth: 0,
  endReason: null,
  pauseCause: null,
};

const same = (a: MatchSnapshot, b: MatchSnapshot): boolean =>
  a.phase === b.phase &&
  a.score === b.score &&
  a.timeLeft === b.timeLeft &&
  a.health === b.health &&
  a.maxHealth === b.maxHealth &&
  a.endReason === b.endReason &&
  a.pauseCause === b.pauseCause;

/**
 * Minimal external store for `useSyncExternalStore`. The game pushes a fresh snapshot every tick, but
 * subscribers are only notified when a visible value actually changed, so React does not re-render per frame.
 */
export class MatchStore {
  private snapshot: MatchSnapshot = initialSnapshot;
  private readonly listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getSnapshot = (): MatchSnapshot => this.snapshot;

  publish(next: MatchSnapshot): void {
    if (same(this.snapshot, next)) return;
    this.snapshot = next;
    for (const l of this.listeners) l();
  }
}
