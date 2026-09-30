import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../sim/types';
import { cuesFor } from './soundMap';

const shot = (weapon: 'front' | 'side' | 'enemy'): SimEvent => ({
  type: 'shot',
  x: 0,
  y: 0,
  angle: 0,
  owner: weapon === 'enemy' ? 'enemy' : 'player',
  weapon,
});

describe('cuesFor', () => {
  it('plays one broadside boom for a 3-shot volley', () => {
    const cues = cuesFor([shot('side'), shot('side'), shot('side')]);
    expect(cues).toEqual([{ sound: 'cannon_broadside', volume: 0.8 }]);
  });

  it('uses a cannon take for front shots, quieter for enemy fire', () => {
    const [front] = cuesFor([shot('front')], () => 0);
    const [enemy] = cuesFor([shot('enemy')], () => 0.99);
    expect(front).toEqual({ sound: 'cannon_fire_1', volume: 0.7 });
    expect(enemy?.sound).toBe('cannon_fire_3');
    expect(enemy?.volume).toBeLessThan(front?.volume ?? 0);
  });

  it('maps hits, splashes, rams and destruction', () => {
    const cues = cuesFor(
      [
        { type: 'hit', x: 0, y: 0, target: 'player', targetId: 0 },
        { type: 'splash', x: 0, y: 0 },
        { type: 'rammed', x: 0, y: 0 },
        { type: 'destroyed', x: 0, y: 0, target: 'enemy', targetId: 3 },
      ],
      () => 0,
    ).map((c) => c.sound);
    expect(cues).toEqual(['ship_wood_hit_1', 'cannonball_water_hit_1', 'ship_collision', 'ship_explosion_1']);
  });

  it('keeps the loudest of duplicate cues in one frame', () => {
    const cues = cuesFor(
      [
        { type: 'hit', x: 0, y: 0, target: 'enemy', targetId: 1 },
        { type: 'hit', x: 0, y: 0, target: 'player', targetId: 0 },
      ],
      () => 0,
    );
    expect(cues).toEqual([{ sound: 'ship_wood_hit_1', volume: 0.85 }]);
  });

  it('sinks the player with its own sound', () => {
    expect(cuesFor([{ type: 'destroyed', x: 0, y: 0, target: 'player', targetId: 0 }]).map((c) => c.sound)).toEqual(['ship_sinking']);
  });

  it('is silent when nothing happened', () => {
    expect(cuesFor([])).toEqual([]);
  });
});
