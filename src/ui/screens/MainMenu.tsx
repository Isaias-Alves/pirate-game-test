import { loadLastResult } from '../../storage/results';
import { HistoryPanel, RankingPanel } from '../board/BoardPanels';
import { END_REASON_TEXT, formatClock, formatDate } from '../format';
import { Tabs } from '../Tabs';
import { useFocusOnMount } from '../useFocusOnMount';
import { uiUrl } from '../uiAssets';
import { ControlsLegend } from './ControlsLegend';

interface MainMenuProps {
  onPlay: () => void;
  onOptions: () => void;
}

function LastMatch() {
  const last = loadLastResult();
  if (!last) return null;
  return (
    <section className="last-match" aria-labelledby="last-match-title" data-testid="last-match">
      <h2 id="last-match-title">Last match</h2>
      <p className="last-match__score">
        <span data-testid="last-match-score">{last.score}</span> {last.score === 1 ? 'ship sunk' : 'ships sunk'}
      </p>
      <p className="last-match__meta">
        {END_REASON_TEXT[last.endReason]} · {formatClock(last.playedSeconds)} played · {formatDate(last.endedAt)}
      </p>
    </section>
  );
}

export function MainMenu({ onPlay, onOptions }: MainMenuProps) {
  const heading = useFocusOnMount<HTMLHeadingElement>();
  return (
    <main className="scene menu" data-testid="screen-menu">
      <header className="menu__header">
        <h1 ref={heading} tabIndex={-1} className="menu__title">
          <img src={uiUrl('title_pirate_battle')} alt="Pirate Battle" draggable={false} />
        </h1>
      </header>

      <div className="menu__grid">
        <section className="panel menu__main" aria-label="Main menu">
          <div className="menu__actions">
            <button type="button" className="btn" onClick={onPlay} data-testid="play">
              Play
            </button>
            <button type="button" className="btn btn--secondary" onClick={onOptions} data-testid="options">
              Options
            </button>
          </div>
          <LastMatch />
        </section>

        <section className="panel menu__board" aria-label="Leaderboards">
          <Tabs
            label="Leaderboards"
            tabs={[
              { id: 'ranking', label: 'Ranking', panel: <RankingPanel /> },
              { id: 'history', label: 'Match History', panel: <HistoryPanel /> },
            ]}
          />
        </section>

        <section className="panel menu__controls">
          <ControlsLegend />
        </section>
      </div>
    </main>
  );
}
