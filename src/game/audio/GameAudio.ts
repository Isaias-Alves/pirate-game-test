import type { Simulation } from '../sim/Simulation';
import type { SimEvent } from '../sim/types';
import { AudioEngine } from './AudioEngine';
import { cuesFor, type SoundName } from './soundMap';

/** Seconds left at which the "hurry up" sting plays once. */
const TIME_WARNING_AT = 10;
const AMBIENCE_VOLUME = 0.22;
const SAILING_VOLUME = 0.3;

const PRELOAD: SoundName[] = [
  'cannon_broadside',
  'cannon_fire_1',
  'cannon_fire_2',
  'cannon_fire_3',
  'cannonball_water_hit_1',
  'cannonball_water_hit_2',
  'ship_wood_hit_1',
  'ship_wood_hit_2',
  'ship_explosion_1',
  'ship_explosion_2',
  'ship_collision',
  'ship_sinking',
  'score_point',
  'health_low',
  'time_warning',
  'game_start',
  'game_pause',
  'game_resume',
  'game_over',
  'game_complete',
  'ocean_ambience_loop',
  'ship_sailing_loop',
];

/**
 * Game sounds, driven by the same per-frame simulation events as the renderer. Presentation only: it reads the
 * simulation and never changes it. Loops fade out while paused and when the match ends.
 */
export class GameAudio {
  private readonly engine: AudioEngine;
  private score = 0;
  private timeWarned = false;
  private lowWarned = false;
  private active = false;

  constructor(
    muted: boolean,
    private readonly lowHealthFraction: number,
  ) {
    this.engine = new AudioEngine(muted);
    this.engine.preload(PRELOAD);
  }

  /** A new match begins (first start or restart). */
  start(): void {
    this.score = 0;
    this.timeWarned = false;
    this.lowWarned = false;
    this.active = true;
    this.engine.resume();
    this.engine.play({ sound: 'game_start', volume: 0.6 });
    this.engine.loop('ocean_ambience_loop', AMBIENCE_VOLUME);
  }

  /** Called once per rendered frame while playing, with the events drained from the simulation. */
  frame(events: readonly SimEvent[], sim: Simulation): void {
    if (!this.active) return;
    for (const cue of cuesFor(events)) this.engine.play(cue);

    if (sim.score > this.score) this.engine.play({ sound: 'score_point', volume: 0.5 });
    this.score = sim.score;

    const p = sim.player;
    const low = p.health > 0 && p.health <= p.maxHealth * this.lowHealthFraction;
    if (low && !this.lowWarned) this.engine.play({ sound: 'health_low', volume: 0.7 });
    this.lowWarned = low;

    const timeLeft = sim.duration - sim.time;
    if (!this.timeWarned && timeLeft <= TIME_WARNING_AT && sim.duration > TIME_WARNING_AT) {
      this.timeWarned = true;
      this.engine.play({ sound: 'time_warning', volume: 0.7 });
    }

    const moving = Math.min(1, p.speed / sim.config.player.moveSpeed);
    this.engine.loop('ship_sailing_loop', moving > 0.05 ? SAILING_VOLUME * moving : 0);
  }

  paused(): void {
    if (!this.active) return;
    this.engine.play({ sound: 'game_pause', volume: 0.5 });
    this.fadeLoops();
  }

  resumed(): void {
    if (!this.active) return;
    this.engine.resume();
    this.engine.play({ sound: 'game_resume', volume: 0.5 });
    this.engine.loop('ocean_ambience_loop', AMBIENCE_VOLUME);
  }

  ended(reason: 'time' | 'death'): void {
    this.fadeLoops();
    this.engine.play({ sound: reason === 'death' ? 'game_over' : 'game_complete', volume: 0.8 });
    this.active = false;
  }

  setMuted(muted: boolean): void {
    this.engine.setMuted(muted);
  }

  private fadeLoops(): void {
    this.engine.loop('ocean_ambience_loop', 0);
    this.engine.loop('ship_sailing_loop', 0);
  }

  dispose(): void {
    this.active = false;
    this.engine.dispose();
  }
}
