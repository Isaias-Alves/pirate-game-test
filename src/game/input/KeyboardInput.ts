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

/**
 * Writes held keys into a shared InputState. Listeners exist only between attach() and detach(),
 * so keys are captured (and default-prevented) only while the gameplay context is active.
 */
export class KeyboardInput {
  private attached = false;

  constructor(private readonly state: InputState) {}

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

  /** Drops every held key (used on blur/pause so nothing is "stuck" or accumulated across a pause). */
  readonly release = (): void => {
    Object.assign(this.state, emptyInput());
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    this.state[action] = true;
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const action = KEY_MAP[e.code];
    if (!action) return;
    e.preventDefault();
    this.state[action] = false;
  };
}
