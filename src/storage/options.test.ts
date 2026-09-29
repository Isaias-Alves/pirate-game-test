import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS, loadOptions, matchConfig, saveOptions, validateOptions } from './options';

// Minimal in-memory localStorage for the node test environment.
const memory = new Map<string, string>();
beforeEach(() => {
  memory.clear();
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => void memory.set(k, v),
      removeItem: (k: string) => void memory.delete(k),
    },
  };
});

describe('validateOptions', () => {
  it('accepts values inside the documented limits, including the boundaries', () => {
    expect(validateOptions({ sessionSeconds: '60', spawnInterval: '0.5' }).options).toEqual({ sessionSeconds: 60, spawnInterval: 0.5 });
    expect(validateOptions({ sessionSeconds: '180', spawnInterval: '10' }).options).toEqual({ sessionSeconds: 180, spawnInterval: 10 });
  });

  it.each([
    ['59', '3', 'sessionSeconds'],
    ['181', '3', 'sessionSeconds'],
    ['90.5', '3', 'sessionSeconds'],
    ['', '3', 'sessionSeconds'],
    ['abc', '3', 'sessionSeconds'],
    ['90', '0', 'spawnInterval'],
    ['90', '-1', 'spawnInterval'],
    ['90', '0.49', 'spawnInterval'],
    ['90', '10.1', 'spawnInterval'],
    ['90', '', 'spawnInterval'],
  ])('rejects session=%s spawn=%s', (session, spawn, field) => {
    const r = validateOptions({ sessionSeconds: session, spawnInterval: spawn });
    expect(r.options).toBeUndefined();
    expect(r.errors[field as 'sessionSeconds' | 'spawnInterval']).toBeTruthy();
  });
});

describe('persistence', () => {
  it('round-trips saved options', () => {
    saveOptions({ sessionSeconds: 75, spawnInterval: 2.5 });
    expect(loadOptions()).toEqual({ sessionSeconds: 75, spawnInterval: 2.5 });
  });

  it('falls back to defaults for missing or corrupt data', () => {
    expect(loadOptions()).toEqual(DEFAULT_OPTIONS);
    memory.set('pirate-battle:options:v1', '{not json');
    expect(loadOptions()).toEqual(DEFAULT_OPTIONS);
    memory.set('pirate-battle:options:v1', JSON.stringify({ sessionSeconds: 9999, spawnInterval: 4 }));
    expect(loadOptions()).toEqual({ sessionSeconds: DEFAULT_OPTIONS.sessionSeconds, spawnInterval: 4 });
  });

  it('builds a per-match config snapshot without mutating the base config', () => {
    const cfg = matchConfig({ sessionSeconds: 90, spawnInterval: 2 });
    expect(cfg.session.duration).toBe(90);
    expect(cfg.spawn.interval).toBe(2);
    expect(matchConfig(DEFAULT_OPTIONS).session.duration).toBe(DEFAULT_OPTIONS.sessionSeconds);
  });
});
