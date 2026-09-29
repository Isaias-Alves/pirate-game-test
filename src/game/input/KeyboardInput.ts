import { emptyInput, type InputState } from './InputState';

const KEY_MAP: Record<string, keyof InputState> = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyA: 'turnLeft',
  ArrowLeft: 'turnLeft',
  KeyD: 'turnRight',
  ArrowRight: 'turnRight',
  Space: 'fireFront',
  KeyQ: 'fireLeft',
  KeyE: 'fireRight',
};

const PAUSE_KEYS = new Set(['Escape', 'KeyP']);

/**
 * Writes held keys into a shared InputState. Listeners exist only between attach() and detach(),
 * so keys are captured (and default-prevented) only while the gameplay context is active.
 * While `capture` is false (game paused) action keys are ignored, so nothing accumulates during a pause.
 */
export class KeyboardInput {
  private attached = false;
  private capture = true;

  constructor(
    private readonly state: InputState,
    private readonly onPauseKey: () => void,
  ) {}

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.release);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.release);
    this.release();
  }

  /** Enables/disables action keys. Disabling also drops anything currently held. */
  setCapture(on: boolean): void {
    this.capture = on;
    if (!on) this.release();
  }

  /** Drops every held key (blur, pause, restart) so nothing is "stuck" or carried across a pause. */
  readonly release = (): void => {
    Object.assign(this.state, emptyInput());
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (PAUSE_KEYS.has(e.code)) {
      e.preventDefault();
      if (!e.repeat) this.onPauseKey();
      return;
    }
    const action = KEY_MAP[e.code];
    if (!action || !this.capture) return;
    e.preventDefault();
    this.state[action] = true;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    if (this.capture) e.preventDefault();
    this.state[action] = false;
  };
}
