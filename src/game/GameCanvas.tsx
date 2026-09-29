import { Application } from 'pixi.js';
import { useEffect, useRef, useState } from 'react';
import { loadGameAssets } from './assets';
import { Game } from './Game';
import { gameConfig } from './gameConfig';
import { exposeGame } from './testHooks';

type Status = 'loading' | 'ready' | 'error';

/**
 * Owns a PixiJS Application and a Game for its lifetime. Pixi init and asset loading are async, so
 * the effect tracks `cancelled` to stay safe under React Strict Mode's mount → unmount → mount cycle.
 */
export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application();
    let game: Game | undefined;
    const life = { cancelled: false, destroyed: false };
    const isCancelled = () => life.cancelled;
    let initialised = false;

    const teardown = () => {
      if (life.destroyed) return;
      life.destroyed = true;
      game?.dispose();
      game = undefined;
      exposeGame(undefined);
      if (initialised) app.destroy({ removeView: true }, { children: true });
    };

    void (async () => {
      try {
        setStatus('loading');
        await app.init({
          resizeTo: host,
          background: '#0b2a3d',
          antialias: true,
          resolution: window.devicePixelRatio,
          autoDensity: true,
        });
        initialised = true;
        if (isCancelled()) {
          teardown();
          return;
        }
        host.appendChild(app.canvas);

        const textures = await loadGameAssets();
        if (isCancelled()) {
          teardown();
          return;
        }

        game = new Game(app, textures, gameConfig);
        exposeGame(game);
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
      // If init/loading is still in flight the async block tears down when it resumes.
      if (initialised) teardown();
    };
  }, [attempt]);

  return (
    <div ref={hostRef} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {status === 'loading' && <p style={overlay}>Loading…</p>}
      {status === 'error' && (
        <div style={overlay} role="alert">
          <p>Could not load game assets.</p>
          <button type="button" onClick={() => { setAttempt((n) => n + 1); }}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

const overlay = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  color: '#e8f4f8',
  font: '16px sans-serif',
} as const;
