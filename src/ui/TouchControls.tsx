import { useState, type PointerEvent } from 'react';
import type { Game } from '../game/Game';
import type { InputState } from '../game/input/InputState';
import { uiUrl } from './uiAssets';
import './touch.css';

interface HoldButtonProps {
  game: Game;
  action: keyof InputState;
  icon: string;
  label: string;
  className: string;
}

/**
 * A button that holds an input flag for as long as a pointer is down on it. Each button tracks its own
 * pointer (pointer capture), so movement and firing can be held at the same time with different fingers.
 */
function HoldButton({ game, action, icon, label, className }: HoldButtonProps) {
  const [pressed, setPressed] = useState(false);

  const press = (e: PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (!game.setControl(action, true)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressed(true);
  };
  const release = () => {
    game.setControl(action, false);
    setPressed(false);
  };

  return (
    <button
      type="button"
      className={`touch-btn ${className}`}
      data-pressed={pressed}
      data-testid={`touch-${action}`}
      aria-label={label}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => {
        e.preventDefault();
      }}
    >
      <img src={uiUrl(icon)} alt="" draggable={false} />
    </button>
  );
}

/**
 * On-screen controls mirroring the keyboard: turn left/right and forward on the bottom, three cannons
 * (port broadside, front, starboard broadside) above the forward button.
 */
export function TouchControls({ game }: { game: Game }) {
  return (
    <div className="touch" role="group" aria-label="Touch controls">
      <div className="touch__cluster touch__cluster--left">
        <HoldButton game={game} action="turnLeft" icon="icon_turn_left" label="Turn left" className="touch-btn--turn" />
        <HoldButton game={game} action="turnRight" icon="icon_turn_right" label="Turn right" className="touch-btn--turn" />
      </div>
      <div className="touch__cluster touch__cluster--right">
        <div className="touch__guns">
          <HoldButton game={game} action="fireLeft" icon="icon_fire_left" label="Fire left side" className="touch-btn--gun" />
          <HoldButton game={game} action="fireFront" icon="icon_fire_front" label="Fire front" className="touch-btn--gun" />
          <HoldButton game={game} action="fireRight" icon="icon_fire_right" label="Fire right side" className="touch-btn--gun" />
        </div>
        <HoldButton game={game} action="forward" icon="icon_forward" label="Sail forward" className="touch-btn--forward" />
      </div>
    </div>
  );
}
