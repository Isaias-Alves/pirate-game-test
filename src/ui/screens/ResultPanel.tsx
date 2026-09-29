import { useRef } from 'react';
import type { MatchResult } from '../../game/matchStore';
import { Dialog } from '../Dialog';
import { END_REASON_TEXT, formatClock } from '../format';

interface ResultPanelProps {
  result: MatchResult;
  onPlayAgain: () => void;
  onExit: () => void;
}

/** Shown over the frozen arena when a match ends. */
export function ResultPanel({ result, onPlayAgain, onExit }: ResultPanelProps) {
  const playAgain = useRef<HTMLButtonElement>(null);
  const sunk = result.endReason === 'death';
  return (
    <Dialog labelledBy="result-title" initialFocus={playAgain} className="result">
      <h2 id="result-title" data-testid="result-title">
        {sunk ? 'Ship sunk!' : "Time's up!"}
      </h2>
      <p className="result__score">
        <span data-testid="result-score">{result.score}</span>
        <span className="result__score-label">{result.score === 1 ? 'ship sunk' : 'ships sunk'}</span>
      </p>
      <dl className="result__stats">
        <div>
          <dt>Time played</dt>
          <dd data-testid="result-time">{formatClock(result.playedSeconds)}</dd>
        </div>
        <div>
          <dt>Match ended</dt>
          <dd data-testid="result-reason">{END_REASON_TEXT[result.endReason]}</dd>
        </div>
      </dl>
      <div className="result__actions">
        <button ref={playAgain} type="button" className="btn" onClick={onPlayAgain} data-testid="play-again">
          Play Again
        </button>
        <button type="button" className="btn btn--secondary" onClick={onExit} data-testid="main-menu">
          Main Menu
        </button>
      </div>
    </Dialog>
  );
}
