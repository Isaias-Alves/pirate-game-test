import type { Application, Ticker } from 'pixi.js';
import type { GameTextures } from './assets';
import type { GameConfig } from './gameConfig';
import { emptyInput } from './input/InputState';
import { KeyboardInput } from './input/KeyboardInput';
import { Renderer } from './render/Renderer';
import { Simulation } from './sim/Simulation';

/**
 * Glue between the Pixi ticker, the simulation, input and rendering. Owns every listener and
 * ticker callback it creates and releases them in dispose().
 *
 * The simulation advances in fixed steps from an accumulator, so behaviour does not depend on frame rate.
 */
export class Game {
  readonly sim: Simulation;
  readonly input = emptyInput();
  private readonly keyboard = new KeyboardInput(this.input);
  private readonly renderer: Renderer;
  private accumulator = 0;
  private disposed = false;

  constructor(
    private readonly app: Application,
    textures: GameTextures,
    private readonly config: GameConfig,
    seed = Date.now(),
  ) {
    this.sim = new Simulation(config, seed);
    this.renderer = new Renderer(app, this.sim, textures);
    this.keyboard.attach();
    app.ticker.add(this.onTick);
  }

  private readonly onTick = (ticker: Ticker): void => {
    const { fixedStep, maxFrameDelta } = this.config.simulation;
    this.accumulator += Math.min(ticker.deltaMS / 1000, maxFrameDelta);
    while (this.accumulator >= fixedStep) {
      this.sim.step(fixedStep, this.input);
      this.accumulator -= fixedStep;
    }
    // Effects are wired up in phase 6; drain so the queue cannot grow unbounded.
    this.sim.drainEvents();
    this.renderer.update();
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.app.ticker.remove(this.onTick);
    this.keyboard.detach();
    this.renderer.destroy();
  }
}
