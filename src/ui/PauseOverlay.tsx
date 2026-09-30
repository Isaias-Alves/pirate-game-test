import { useRef } from 'react';
import type { Game } from '../game/Game';
import { Dialog } from './Dialog';
import { ControlsList } from './screens/ControlsLegend';
import { useClickGuard } from './useClickGuard';
import { useMatch } from './useMatch';

interface PauseOverlayProps {
  game: Game;
  onRestart: () => void;
  onExit: () => void;
}

/**
 * Modal shown while paused. Resuming always needs an explicit action (button, or the pause key) so
 * nothing from the paused period is carried over.
 */
export function PauseOverlay({ game, onRestart, onExit }: PauseOverlayProps) {
  const m = useMatch(game);
  if (m.phase !== 'paused') return null;
  return <PauseDialog game={game} focusCause={m.pauseCause} onRestart={onRestart} onExit={onExit} />;
}

function PauseDialog({ game, focusCause, onRestart, onExit }: PauseOverlayProps & { focusCause: 'manual' | 'focus' | null }) {
  const resume = useRef<HTMLButtonElement>(null);
  const guarded = useClickGuard();
  return (
    <Dialog labelledBy="pause-title" initialFocus={resume} className="pause">
      <h2 id="pause-title">Paused</h2>
      <p>{focusCause === 'focus' ? 'The game paused because the window lost focus.' : 'Take a breather, captain.'}</p>
      <div className="pause__actions">
        <button
          ref={resume}
          type="button"
          className="btn"
          onClick={guarded(() => {
            game.resume();
          })}
          data-testid="resume"
        >
          Resume
        </button>
        <button type="button" className="btn btn--secondary btn--small" onClick={guarded(onRestart)} data-testid="restart">
          Restart
        </button>
        <button type="button" className="btn btn--secondary btn--small" onClick={guarded(onExit)} data-testid="quit">
          Main Menu
        </button>
      </div>
      <details className="pause__controls" data-testid="pause-controls">
        <summary>Controls</summary>
        <ControlsList />
      </details>
      <p className="overlay__hint">Esc or P also resumes. Leaving abandons this match — it will not be recorded.</p>
    </Dialog>
  );
}
