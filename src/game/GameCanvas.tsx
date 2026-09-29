import { Application, Graphics } from 'pixi.js';
import { useEffect, useRef } from 'react';
import { gameConfig } from './gameConfig';

/**
 * Owns a PixiJS Application for its lifetime. Pixi's init is async, so the
 * effect tracks `cancelled` to stay safe under React Strict Mode's
 * mount → unmount → mount cycle.
 */
export function GameCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const app = new Application();
    let cancelled = false;
    let ready = false;

    void app
      .init({
        resizeTo: host,
        background: '#0b2a3d',
        antialias: true,
        resolution: window.devicePixelRatio,
        autoDensity: true,
      })
      .then(() => {
        ready = true;
        if (cancelled) {
          app.destroy({ removeView: true }, { children: true });
          return;
        }
        host.appendChild(app.canvas);
        const { width, height } = gameConfig.arena;
        // Placeholder so the pipeline is visibly alive; replaced by the arena in phase 2.
        app.stage.addChild(new Graphics().rect(0, 0, width, height).stroke({ width: 2, color: 0x4fc3f7 }));
      });

    return () => {
      cancelled = true;
      if (ready) app.destroy({ removeView: true }, { children: true });
    };
  }, []);

  return <div ref={hostRef} style={{ width: '100%', height: '100%' }} />;
}
