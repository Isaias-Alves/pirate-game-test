import type { Game } from '../game/Game';
import { gameConfig } from '../game/gameConfig';
import type { MatchSnapshot } from '../game/matchStore';
import { uiUrl } from './uiAssets';
import { useMatch } from './useMatch';
import './hud.css';

/** Geometry of health_frame / health_fill_* from ui_sheet.json (256x48 art, fill area 196x20 at 30,15). */
const FRAME = { w: 256, h: 48 };
const FILL = { x: 30, y: 15, w: 196, h: 20 };

const formatTime = (seconds: number): string => {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
};

function healthFillName(fraction: number): string {
  if (fraction > 0.5) return 'health_fill_green';
  if (fraction > gameConfig.feedback.lowHealthFraction) return 'health_fill_amber';
  return 'health_fill_red';
}

function HealthMeter({ snapshot }: { snapshot: MatchSnapshot }) {
  const fraction = snapshot.maxHealth > 0 ? Math.max(0, Math.min(1, snapshot.health / snapshot.maxHealth)) : 0;
  const clip = `inset(${String((FILL.y / FRAME.h) * 100)}% ${String(((FRAME.w - FILL.x - FILL.w * fraction) / FRAME.w) * 100)}% ${String(((FRAME.h - FILL.y - FILL.h) / FRAME.h) * 100)}% ${String((FILL.x / FRAME.w) * 100)}%)`;
  return (
    <div className="hud-health" aria-hidden="true">
      <img className="hud-health__frame" src={uiUrl('health_frame')} alt="" draggable={false} />
      <img className="hud-health__fill" src={uiUrl(healthFillName(fraction))} alt="" draggable={false} style={{ clipPath: clip }} />
      <img className="hud-health__icon" src={uiUrl('icon_heart')} alt="" draggable={false} />
      <span className="hud-health__value" data-testid="health">
        {Math.ceil(Math.max(0, snapshot.health))} / {snapshot.maxHealth}
      </span>
    </div>
  );
}

function Counter({ icon, label, value, warn }: { icon: string; label: string; value: string; warn?: boolean }) {
  return (
    <div className={warn ? 'hud-counter hud-counter--warn' : 'hud-counter'} aria-hidden="true">
      <img className="hud-counter__panel" src={uiUrl('counter_panel')} alt="" draggable={false} />
      <img className="hud-counter__icon" src={uiUrl(icon)} alt="" draggable={false} />
      <span className="hud-counter__value" data-testid={label}>
        {value}
      </span>
    </div>
  );
}

/**
 * Speaker icon drawn to match the atlas icons (cream fill, dark wood outline); the pack has no sound icon.
 * With `muted` the waves are replaced by a cross.
 */
function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <g fill="#fbe8c4" stroke="#4a2e14" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round">
        <path d="M8 19h8l10-8v26l-10-8H8z" />
        {muted ? (
          <path d="M32 18l10 12M42 18L32 30" fill="none" strokeWidth="4.5" />
        ) : (
          <path d="M32 17c3 2 4.5 4.6 4.5 7s-1.5 5-4.5 7M37 12c5 3.3 7.5 7.4 7.5 12S42 32.7 37 36" fill="none" strokeWidth="4" />
        )}
      </g>
    </svg>
  );
}

/** On-screen match HUD. Purely presentational: values come from the store, never per frame. */
export function Hud({ game }: { game: Game }) {
  const m = useMatch(game);
  const lowTime = m.phase !== 'ended' && m.timeLeft <= 10;
  return (
    <header className="hud">
      <HealthMeter snapshot={m} />
      <Counter icon="icon_time" label="time" value={formatTime(m.timeLeft)} warn={lowTime} />
      <Counter icon="icon_score" label="score" value={String(m.score)} />
      <button
        type="button"
        className="hud-round hud-sound"
        aria-label="Mute sound"
        aria-pressed={m.muted}
        title={m.muted ? "Sound off (M)" : "Sound on (M)"}
        data-testid="mute"
        onClick={(e) => {
          e.currentTarget.blur();
          game.toggleMute();
        }}
      >
        <SoundIcon muted={m.muted} />
      </button>
      <button
        type="button"
        className="hud-round hud-pause"
        aria-label={m.phase === 'paused' ? 'Resume game' : 'Pause game'}
        disabled={m.phase === 'ended'}
        onClick={(e) => {
          // Drop focus so the fire key (Space) cannot re-press this button after resuming.
          e.currentTarget.blur();
          game.togglePause();
        }}
      >
        <img src={uiUrl(m.phase === 'paused' ? 'icon_play' : 'icon_pause')} alt="" draggable={false} />
      </button>
    </header>
  );
}
