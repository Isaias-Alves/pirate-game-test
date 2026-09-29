import type { EndReason, MatchRecord, MatchSettings } from '../api/contracts';
import { createRng } from '../game/sim/rng';
import { DEFAULT_OPTIONS } from '../storage/options';

const NAMES = [
  'Anne Bonny',
  'Blackbeard',
  'Calico Jack',
  'Captain Kidd',
  'Grace Malley',
  'Henry Morgan',
  'Ching Shih',
  'Bartholomew Roberts',
  'Mary Read',
  'Barbarossa',
  'Jean Lafitte',
  'Sam Bellamy',
  'Edward Low',
  'Rackham',
  'Stede Bonnet',
  'Anne Dieu',
  'Long Ben',
  'Olivier Levasseur',
  'Charles Vane',
  'Zheng Yi',
];

/** Fixed reference time so fixture dates never change between runs. */
const BASE_TIME = Date.UTC(2026, 8, 1, 12, 0, 0);
const DAY = 86_400_000;

const key = (s: MatchSettings) => `${String(s.sessionSeconds)}/${String(s.spawnInterval)}`;

/** Fixture matches per settings combination: enough for several pages on the default setup, fewer elsewhere. */
const fixtureCount = (settings: MatchSettings): number => (key(settings) === key(DEFAULT_OPTIONS) ? 34 : 18);

/** Stable numeric seed for a settings combination. */
const settingsSeed = (s: MatchSettings): number => Math.round(s.sessionSeconds * 1000 + s.spawnInterval * 10);

function makeMatches(prefix: string, seed: number, settings: MatchSettings, count: number, player?: { id: string; name: string }): MatchRecord[] {
  const rng = createRng(seed);
  const out: MatchRecord[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * NAMES.length);
    const name = player?.name ?? NAMES[idx] ?? 'Unknown Pirate';
    // Faster spawns and longer sessions give a higher ceiling.
    const ceiling = Math.round((settings.sessionSeconds / settings.spawnInterval) * 0.55) + 4;
    const score = Math.max(0, Math.round(rng() * rng() * ceiling * 1.1 + rng() * 3));
    const died = rng() < 0.35;
    const duration = died ? Math.max(8, Math.round(settings.sessionSeconds * (0.25 + rng() * 0.7))) : settings.sessionSeconds;
    const endReason: EndReason = died ? 'death' : 'time';
    out.push({
      matchId: `${prefix}-${key(settings)}-${String(i)}`,
      playerId: player?.id ?? `fixture-${String(idx)}`,
      playerName: name,
      playedAt: new Date(BASE_TIME - Math.floor(rng() * 30 * DAY) - i * 60_000).toISOString(),
      score,
      durationSeconds: duration,
      endReason,
      settings: { ...settings },
    });
  }
  return out;
}

/** The standing "other players" data for one setup. Deterministic: the same on every run. */
export function fixturesFor(settings: MatchSettings): MatchRecord[] {
  return makeMatches('fx', settingsSeed(settings), settings, fixtureCount(settings));
}

/** Extra ranking entries for the many-pages scenario. */
export function extraFixturesFor(settings: MatchSettings): MatchRecord[] {
  return makeMatches('fx-extra', settingsSeed(settings) + 1, settings, 40);
}

/** A long history for the local player, for exercising history pagination. */
export function syntheticHistory(playerId: string, playerName: string, count = 25): MatchRecord[] {
  return makeMatches('hx', 9000, { ...DEFAULT_OPTIONS }, count, { id: playerId, name: playerName });
}
