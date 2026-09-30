import { afterEach, describe, expect, it, vi } from 'vitest';
import { AudioEngine } from './AudioEngine';

/** Just enough Web Audio to count how often a loop's volume is re-scheduled. */
class FakeParam {
  value = 0;
  scheduled = 0;
  setTargetAtTime(): void {
    this.scheduled += 1;
  }
}
class FakeNode {
  gain = new FakeParam();
  buffer: unknown = null;
  loop = false;
  connect<T>(next: T): T {
    return next;
  }
  start = (): void => undefined;
  stop = (): void => undefined;
}
class FakeContext {
  static gains: FakeNode[] = [];
  state = 'running';
  currentTime = 0;
  destination = {};
  createGain(): FakeNode {
    const node = new FakeNode();
    FakeContext.gains.push(node);
    return node;
  }
  createBufferSource(): FakeNode {
    return new FakeNode();
  }
  decodeAudioData(): Promise<never> {
    return Promise.reject(new Error('not in tests'));
  }
  close(): Promise<void> {
    return Promise.resolve();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  FakeContext.gains = [];
});

describe('AudioEngine loops', () => {
  it('re-schedules a loop volume only when it actually changes (the game calls loop() every frame)', () => {
    vi.stubGlobal('AudioContext', FakeContext);
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    const engine = new AudioEngine(false);
    engine.loop('ship_sailing_loop', 0.3);
    const loopGain = FakeContext.gains[1]; // [0] is the master gain
    if (!loopGain) throw new Error('loop gain not created');

    for (let frame = 0; frame < 120; frame++) engine.loop('ship_sailing_loop', 0.3);
    engine.loop('ship_sailing_loop', 0.305); // inaudible difference
    expect(loopGain.gain.scheduled).toBe(0);

    engine.loop('ship_sailing_loop', 0);
    expect(loopGain.gain.scheduled).toBe(1);
    engine.dispose();
  });
});
