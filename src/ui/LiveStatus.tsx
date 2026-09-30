import { useEffect, useRef, useState } from 'react';
import type { Game } from '../game/Game';
import { gameConfig } from '../game/gameConfig';
import type { MatchSnapshot } from '../game/matchStore';
import { useMatch } from './useMatch';

const TIME_WARNINGS = [30, 10];

/** One-off announcements derived from snapshot transitions. Never fires per frame. */
function announcement(prev: MatchSnapshot | undefined, next: MatchSnapshot): string | null {
  if (!prev) return null;
  if (prev.phase !== next.phase) {
    if (next.phase === 'paused') return next.pauseCause === 'focus' ? 'Game paused because the window lost focus.' : 'Game paused.';
    if (next.phase === 'playing' && prev.phase === 'paused') return 'Game resumed.';
    if (next.phase === 'ended') {
      return next.endReason === 'death'
        ? `Your ship was sunk. Final score ${String(next.score)}.`
        : `Time is up. Final score ${String(next.score)}.`;
    }
  }
  if (next.phase === 'playing') {
    const low = gameConfig.feedback.lowHealthFraction * next.maxHealth;
    if (prev.health > low && next.health <= low && next.health > 0) return 'Warning: hull integrity low.';
    const warn = TIME_WARNINGS.find((t) => prev.timeLeft > t && next.timeLeft <= t);
    if (warn !== undefined) return `${String(warn)} seconds left.`;
  }
  return null;
}

/**
 * Screen-reader interface for the match. Score, time and hull are plain, always-readable elements
 * (not live regions, so they are not read out every second); important transitions go through one
 * polite live region.
 */
export function LiveStatus({ game }: { game: Game }) {
  const m = useMatch(game);
  const prev = useRef<MatchSnapshot | undefined>(undefined);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const note = announcement(prev.current, m);
    prev.current = m;
    if (note) setMessage(note);
  }, [m]);

  const state = m.phase === 'ended' ? 'Match over' : m.phase === 'paused' ? 'Paused' : 'In progress';
  return (
    <section className="sr-only" aria-label="Match status">
      <p>Status: {state}</p>
      <p>Score: {m.score}</p>
      <p role="timer">Time left: {m.timeLeft} seconds</p>
      <label>
        Hull integrity
        <meter min={0} max={m.maxHealth} low={m.maxHealth * gameConfig.feedback.lowHealthFraction} optimum={m.maxHealth} value={m.health}>
          {m.health} of {m.maxHealth}
        </meter>
      </label>
      <div role="status" aria-live="polite" aria-atomic="true">
        {message}
      </div>
    </section>
  );
}
