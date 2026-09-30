import type { SimEvent } from '../sim/types';

/** Every sound file the game uses (assets/sounds/<name>.wav). */
export type SoundName =
  | 'cannon_broadside'
  | 'cannon_fire_1'
  | 'cannon_fire_2'
  | 'cannon_fire_3'
  | 'cannonball_water_hit_1'
  | 'cannonball_water_hit_2'
  | 'game_complete'
  | 'game_over'
  | 'game_pause'
  | 'game_resume'
  | 'game_start'
  | 'health_low'
  | 'ocean_ambience_loop'
  | 'score_point'
  | 'ship_collision'
  | 'ship_explosion_1'
  | 'ship_explosion_2'
  | 'ship_sailing_loop'
  | 'ship_sinking'
  | 'ship_wood_hit_1'
  | 'ship_wood_hit_2'
  | 'time_warning';

export interface Cue {
  sound: SoundName;
  /** 0..1, relative to the master volume. */
  volume: number;
}

/** Picks one of several takes so repeated sounds do not feel mechanical. `pick` is 0..1. */
const oneOf = <T>(options: readonly [T, ...T[]], pick: number): T => options[Math.min(options.length - 1, Math.floor(pick * options.length))] ?? options[0];

/**
 * Turns the simulation events of one frame into sound cues. Pure, so the mapping is unit-tested.
 * Several identical cues in one frame collapse into one (a 3-shot broadside is one boom, not three).
 */
export function cuesFor(events: readonly SimEvent[], pick: () => number = Math.random): Cue[] {
  const cues = new Map<SoundName, Cue>();
  const add = (sound: SoundName, volume: number) => {
    const existing = cues.get(sound);
    if (!existing || existing.volume < volume) cues.set(sound, { sound, volume });
  };

  for (const ev of events) {
    switch (ev.type) {
      case 'shot':
        if (ev.weapon === 'side') add('cannon_broadside', 0.8);
        else if (ev.weapon === 'front') add(oneOf(['cannon_fire_1', 'cannon_fire_2', 'cannon_fire_3'], pick()), 0.7);
        else add(oneOf(['cannon_fire_1', 'cannon_fire_2', 'cannon_fire_3'], pick()), 0.35);
        break;
      case 'splash':
        add(oneOf(['cannonball_water_hit_1', 'cannonball_water_hit_2'], pick()), 0.5);
        break;
      case 'hit':
        add(oneOf(['ship_wood_hit_1', 'ship_wood_hit_2'], pick()), ev.target === 'player' ? 0.85 : 0.6);
        break;
      case 'rammed':
        add('ship_collision', 0.9);
        break;
      case 'destroyed':
        if (ev.target === 'player') add('ship_sinking', 1);
        else add(oneOf(['ship_explosion_1', 'ship_explosion_2'], pick()), 0.75);
        break;
    }
  }
  return [...cues.values()];
}
