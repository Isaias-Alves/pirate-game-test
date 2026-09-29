import { Application } from 'pixi.js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { loadGameAssets } from '../../game/assets';
import { useSubmissions } from '../../api/submissionsContext';
import { Game } from '../../game/Game';
import { currentResolution, watchPixelRatio } from '../../game/pixelRatio';
import type { MatchResult } from '../../game/matchStore';
import { exposeGame } from '../../game/testHooks';
import { loadOptions, matchConfig } from '../../storage/options';
import { saveLastResult } from '../../storage/results';
import { Hud } from '../Hud';
import { LiveStatus } from '../LiveStatus';
import { PauseOverlay } from '../PauseOverlay';
import { TouchControls } from '../TouchControls';
import { wantsTouchControls } from '../touchSupport';
import { ResultPanel } from './ResultPanel';
import '../hud.css';
import '../touch.css';

type Status = 'loading' | 'ready' | 'error';

/**
 * Owns a PixiJS Application and a Game for the lifetime of one visit to the combat screen. Pixi init and
 * asset loading are async, so the effect tracks cancellation to stay safe under React Strict Mode's
 * mount → unmount → mount cycle. Leaving the screen disposes everything; an unfinished match is abandoned.
 */
export function MatchScreen({ onExit }: { onExit: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [game, setGame] = useState<Game | null>(null);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [touch] = useState(wantsTouchControls);
  const { enqueue } = useSubmissions();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application();
    let current: Game | undefined;
    const life = { cancelled: false, destroyed: false };
    const isCancelled = () => life.cancelled;
    let initialised = false;
    // The host can change size without a window resize (e.g. the HUD row appearing), so observe it directly.
    const observer = new ResizeObserver(() => {
      if (initialised && !life.destroyed) app.renderer.resize(host.clientWidth, host.clientHeight);
    });
    observer.observe(host);
    let stopWatchingRatio: (() => void) | undefined;

    const teardown = () => {
      if (life.destroyed) return;
      life.destroyed = true;
      observer.disconnect();
      stopWatchingRatio?.();
      current?.dispose();
      current = undefined;
      exposeGame(undefined);
      if (initialised) app.destroy({ removeView: true }, { children: true });
    };

    void (async () => {
      try {
        setStatus('loading');
        setProgress(0);
        await app.init({
          width: host.clientWidth,
          height: host.clientHeight,
          background: '#0b2a3d',
          antialias: true,
          resolution: currentResolution(),
          autoDensity: true,
        });
        initialised = true;
        if (isCancelled()) {
          teardown();
          return;
        }
        host.appendChild(app.canvas);
        // Follow browser zoom / monitor changes: re-render at the new density, keep the same logical size.
        stopWatchingRatio = watchPixelRatio(() => {
          if (life.destroyed) return;
          app.renderer.resolution = currentResolution();
          app.renderer.resize(host.clientWidth, host.clientHeight);
        });

        const textures = await loadGameAssets(setProgress, currentResolution());
        if (isCancelled()) {
          teardown();
          return;
        }

        current = new Game(app, textures, matchConfig(loadOptions()));
        current.onMatchEnd((r) => {
          saveLastResult(r);
          // Stored durably before any network call, so a failure or reload cannot lose the result.
          enqueue(r);
          setResult(r);
        });
        exposeGame(current);
        setGame(current);
        setStatus('ready');
      } catch (err) {
        console.error('Failed to start the game', err);
        if (isCancelled()) {
          teardown();
          return;
        }
        setStatus('error');
      }
    })();

    return () => {
      life.cancelled = true;
      observer.disconnect();
      stopWatchingRatio?.();
      setGame(null);
      setResult(null);
      // If init/loading is still in flight the async block tears down when it resumes.
      if (initialised) teardown();
    };
  }, [attempt, enqueue]);

  /** New match with a fresh snapshot of the latest saved options. */
  const restart = useCallback(() => {
    setResult(null);
    game?.restart(matchConfig(loadOptions()));
  }, [game]);

  return (
    <main className="match" data-testid="screen-match">
      <h1 className="sr-only">Battle</h1>
      {game ? <Hud game={game} /> : <div />}
      <div className="match__arena">
        <div ref={hostRef} style={{ position: 'absolute', inset: 0 }} />
        {status === 'loading' && (
          <div className="match__loading" role="status" data-testid="loading">
            <p>Loading the seas…</p>
            <progress className="loadbar" max={1} value={progress} aria-label="Loading game assets" />
            <p className="match__loading-pct">{Math.round(progress * 100)}%</p>
          </div>
        )}
        {status === 'error' && (
          <div className="match__loading" role="alert" data-testid="load-error">
            <p>Could not load game assets. Check your connection and try again.</p>
            <button
              type="button"
              className="btn btn--small"
              data-testid="retry"
              onClick={() => {
                setAttempt((n) => n + 1);
              }}
            >
              Retry
            </button>
            <button type="button" className="btn btn--secondary btn--small" onClick={onExit}>
              Main Menu
            </button>
          </div>
        )}
        {game && touch && (
          <>
            <p className="touch-hint">Rotate your device for a bigger arena</p>
            <TouchControls game={game} />
          </>
        )}
        {game && !result && <PauseOverlay game={game} onRestart={restart} onExit={onExit} />}
        {game && result && <ResultPanel result={result} onPlayAgain={restart} onExit={onExit} />}
      </div>
      {game && <LiveStatus game={game} />}
    </main>
  );
}
