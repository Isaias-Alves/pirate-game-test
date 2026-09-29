import type { Application, Ticker } from 'pixi.js';
import type { GameTextures } from './assets';
import type { GameConfig } from './gameConfig';
import { emptyInput, type InputState } from './input/InputState';
import { KeyboardInput } from './input/KeyboardInput';
import { MatchStore, type MatchPhase, type MatchResult, type MatchSnapshot } from './matchStore';
import { Renderer } from './render/Renderer';
import { Simulation } from './sim/Simulation';
import { newId } from '../storage/ids';

/**
 * Glue between the Pixi ticker, the simulation, input and rendering. Owns every listener and
 * ticker callback it creates and releases them in dispose().
 *
 * The simulation advances in fixed steps from an accumulator, so behaviour does not depend on frame rate.
 */
export class Game {
  readonly store = new MatchStore();
  readonly input = emptyInput();
  private readonly keyboard = new KeyboardInput(this.input, () => {
    this.togglePause();
  });
  private readonly endListeners = new Set<(result: MatchResult) => void>();
  private simulation: Simulation;
  private renderer: Renderer;
  private accumulator = 0;
  private phase: MatchPhase = 'playing';
  private pauseCause: MatchSnapshot['pauseCause'] = null;
  private disposed = false;

  constructor(
    private readonly app: Application,
    private readonly textures: GameTextures,
    private config: GameConfig,
    seed = Date.now(),
  ) {
    this.simulation = new Simulation(config, seed);
    this.renderer = new Renderer(app, this.simulation, textures);
    this.keyboard.attach();
    window.addEventListener('blur', this.onFocusLost);
    document.addEventListener('visibilitychange', this.onVisibility);
    app.ticker.add(this.onTick);
    this.publish();
  }

  get sim(): Simulation {
    return this.simulation;
  }

  get currentPhase(): MatchPhase {
    return this.phase;
  }

  /** Subscribes to the end of a match. Fires once per match. */
  onMatchEnd(listener: (result: MatchResult) => void): () => void {
    this.endListeners.add(listener);
    return () => {
      this.endListeners.delete(listener);
    };
  }

  /**
   * Sets a control from a non-keyboard source (touch). Presses are only accepted while playing, so
   * nothing is queued during a pause or after the end. Releases are always accepted.
   */
  setControl(action: keyof InputState, held: boolean): boolean {
    if (held && !this.isPlaying()) return false;
    this.input[action] = held;
    return true;
  }

  pause(cause: 'manual' | 'focus' = 'manual'): void {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this.pauseCause = cause;
    this.keyboard.setCapture(false);
    this.publish();
  }

  /** Resuming needs a player action (button/key). Nothing from the paused period is carried over. */
  resume(): void {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this.pauseCause = null;
    this.accumulator = 0;
    this.keyboard.setCapture(true);
    this.publish();
  }

  togglePause(): void {
    if (this.phase === 'playing') this.pause('manual');
    else if (this.phase === 'paused') this.resume();
  }

  /** Starts a brand-new match: fresh simulation and scene, optionally with a new config snapshot. */
  restart(config: GameConfig = this.config, seed = Date.now()): void {
    this.config = config;
    this.renderer.destroy();
    this.simulation = new Simulation(config, seed);
    this.renderer = new Renderer(this.app, this.simulation, this.textures);
    this.accumulator = 0;
    this.phase = 'playing';
    this.pauseCause = null;
    this.keyboard.setCapture(true);
    this.publish();
  }

  /** Steps the simulation by `seconds` of game time (fixed steps) and redraws. Used by tests and tooling. */
  advance(seconds: number): void {
    if (this.phase !== 'playing') return;
    const { fixedStep } = this.config.simulation;
    for (let t = 0; t < seconds && this.isPlaying(); t += fixedStep) this.step(fixedStep);
    this.renderer.handleEvents(this.sim.drainEvents());
    this.renderer.update(0);
    this.publish();
  }

  private readonly onFocusLost = (): void => {
    this.pause('focus');
  };

  private readonly onVisibility = (): void => {
    if (document.hidden) this.pause('focus');
  };

  private readonly onTick = (ticker: Ticker): void => {
    if (this.phase === 'playing') {
      const { fixedStep, maxFrameDelta } = this.config.simulation;
      this.accumulator += Math.min(ticker.deltaMS / 1000, maxFrameDelta);
      while (this.accumulator >= fixedStep && this.isPlaying()) {
        this.step(fixedStep);
        this.accumulator -= fixedStep;
      }
      this.renderer.handleEvents(this.sim.drainEvents());
    }
    // Cosmetic timers (flash, shake, effects) run on wall time and freeze while paused.
    this.renderer.update(this.phase === 'paused' ? 0 : ticker.deltaMS / 1000);
    this.publish();
  };

  /** A method (not an inline comparison) so control-flow narrowing does not assume the phase is stable across step(). */
  private isPlaying(): boolean {
    return this.phase === 'playing';
  }

  private step(dt: number): void {
    this.sim.step(dt, this.input);
    if (this.sim.status === 'ended') this.finish();
  }

  private finish(): void {
    this.phase = 'ended';
    this.keyboard.setCapture(false);
    const { sim } = this;
    if (!sim.endReason) return;
    const result: MatchResult = {
      matchId: newId(),
      score: sim.score,
      playedSeconds: sim.time,
      endReason: sim.endReason,
      settings: { sessionSeconds: this.config.session.duration, spawnInterval: this.config.spawn.interval },
      endedAt: new Date().toISOString(),
    };
    this.publish();
    for (const l of this.endListeners) l(result);
  }

  private publish(): void {
    const { sim } = this;
    this.store.publish({
      phase: this.phase,
      score: sim.score,
      timeLeft: Math.ceil(sim.duration - sim.time),
      health: sim.player.health,
      maxHealth: sim.player.maxHealth,
      endReason: sim.endReason,
      pauseCause: this.pauseCause,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.app.ticker.remove(this.onTick);
    window.removeEventListener('blur', this.onFocusLost);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.keyboard.detach();
    this.endListeners.clear();
    this.renderer.destroy();
  }
}
