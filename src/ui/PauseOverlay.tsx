import { useEffect, useRef } from 'react';
import type { Game } from '../game/Game';
import { uiUrl } from './uiAssets';
import { useMatch } from './useMatch';

/**
 * Modal shown while paused. Focus moves to Resume on open and is kept inside the dialog; resuming
 * always needs an explicit action (button, Enter/Space on it, or the pause key).
 */
export function PauseOverlay({ game }: { game: Game }) {
  const m = useMatch(game);
  const resumeRef = useRef<HTMLButtonElement>(null);
  const open = m.phase === 'paused';

  useEffect(() => {
    if (open) resumeRef.current?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <div className="overlay" role="presentation">
      <div
        className="overlay__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-title"
        style={{ backgroundImage: `url(${uiUrl('panel_menu')})` }}
        onKeyDown={(e) => {
          // Single focusable control: keep Tab inside the dialog.
          if (e.key === 'Tab') {
            e.preventDefault();
            resumeRef.current?.focus();
          }
        }}
      >
        <h2 id="pause-title">Paused</h2>
        <p>{m.pauseCause === 'focus' ? 'The game paused because the window lost focus.' : 'Take a breather, captain.'}</p>
        <button
          ref={resumeRef}
          type="button"
          className="btn-primary"
          style={{ backgroundImage: `url(${uiUrl('button_primary_normal')})` }}
          onClick={() => {
            game.resume();
          }}
        >
          Resume
        </button>
        <p className="overlay__hint">Esc or P also resumes.</p>
      </div>
    </div>
  );
}
