import type { Cue, SoundName } from './soundMap';

const urls = import.meta.glob<string>('../../../assets/sounds/*.wav', { eager: true, query: '?url', import: 'default' });

const urlFor = (name: SoundName): string | undefined => Object.entries(urls).find(([path]) => path.endsWith(`/${name}.wav`))?.[1];

/** Decoded sounds are kept for the whole visit, so later matches start without re-downloading. */
const buffers = new Map<SoundName, Promise<AudioBuffer | undefined>>();

/**
 * Minimal Web Audio wrapper. Sound is optional: every failure (no Web Audio, blocked autoplay, a file that does
 * not load or decode) is swallowed so it can never break the game or print console errors.
 */
export class AudioEngine {
  private readonly ctx: AudioContext | undefined;
  private readonly master: GainNode | undefined;
  private readonly loops = new Map<SoundName, { source: AudioBufferSourceNode; gain: GainNode }>();
  private muted: boolean;
  private disposed = false;

  constructor(muted: boolean, private readonly masterVolume = 0.6) {
    this.muted = muted;
    try {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = muted ? 0 : masterVolume;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = undefined;
      this.master = undefined;
    }
  }

  /** Starts fetching and decoding sounds in the background. */
  preload(names: readonly SoundName[]): void {
    for (const name of names) void this.buffer(name);
  }

  private buffer(name: SoundName): Promise<AudioBuffer | undefined> {
    const { ctx } = this;
    if (!ctx) return Promise.resolve(undefined);
    let pending = buffers.get(name);
    if (!pending) {
      const src = urlFor(name);
      pending = src
        ? fetch(src)
            .then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(String(res.status)))))
            .then((data) => ctx.decodeAudioData(data))
            .catch(() => {
              buffers.delete(name); // allow a later retry
              return undefined;
            })
        : Promise.resolve(undefined);
      buffers.set(name, pending);
    }
    return pending;
  }

  play(cue: Cue): void {
    if (this.muted || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    const { ctx, master } = this;
    void this.buffer(cue.sound).then((buffer) => {
      if (!buffer || this.disposed) return;
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();
      source.buffer = buffer;
      gain.gain.value = cue.volume;
      source.connect(gain).connect(master);
      source.start();
    });
  }

  /** Starts (or keeps) a looping sound at `volume`; 0 fades it out. */
  loop(name: SoundName, volume: number): void {
    const { ctx, master } = this;
    if (!ctx || !master) return;
    const running = this.loops.get(name);
    if (running) {
      running.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.15);
      return;
    }
    if (volume <= 0) return;
    // Reserve the slot synchronously so repeated calls while decoding do not start two copies.
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(master);
    const source = ctx.createBufferSource();
    this.loops.set(name, { source, gain });
    void this.buffer(name).then((buffer) => {
      if (!buffer || this.disposed || this.loops.get(name)?.source !== source) return;
      source.buffer = buffer;
      source.loop = true;
      source.connect(gain);
      source.start();
      gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.3);
    });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(muted ? 0 : this.masterVolume, this.ctx.currentTime, 0.05);
  }

  /** Freezes every sound (used while the game is paused). */
  suspend(): void {
    if (this.ctx?.state === 'running') this.ctx.suspend().catch(() => undefined);
  }

  /** Needs a user gesture somewhere in the page's history, which the Play click provides. */
  resume(): void {
    if (this.ctx && this.ctx.state !== 'closed' && this.ctx.state !== 'running') this.ctx.resume().catch(() => undefined);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const { source } of this.loops.values()) {
      try {
        source.stop();
      } catch {
        // never started: nothing to stop
      }
    }
    this.loops.clear();
    this.ctx?.close().catch(() => undefined);
  }
}
