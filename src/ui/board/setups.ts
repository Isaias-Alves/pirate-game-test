import type { MatchSettings } from '../../api/contracts';

export interface RankingSetup {
  id: string;
  label: string;
  settings: MatchSettings;
}

/**
 * Setups the ranking can be browsed by. The ranking never mixes setups (the challenge compares only matches
 * played with the same configuration); this list only picks WHICH setup's ranking is shown.
 */
const PRESETS: readonly { label: string; settings: MatchSettings }[] = [
  { label: 'Quick', settings: { sessionSeconds: 60, spawnInterval: 3 } },
  { label: 'Standard', settings: { sessionSeconds: 120, spawnInterval: 3 } },
  { label: 'Marathon', settings: { sessionSeconds: 180, spawnInterval: 3 } },
  { label: 'Swarm', settings: { sessionSeconds: 120, spawnInterval: 1.5 } },
  { label: 'Calm', settings: { sessionSeconds: 120, spawnInterval: 6 } },
];

export const setupId = (s: MatchSettings): string => `${String(s.sessionSeconds)}/${String(s.spawnInterval)}`;

export const describeSetup = (s: MatchSettings): string => `${String(s.sessionSeconds)} s · enemy every ${String(s.spawnInterval)} s`;

/** The player's current setup first (the default), then the presets that differ from it. */
export function rankingSetups(current: MatchSettings): RankingSetup[] {
  const mine: RankingSetup = { id: setupId(current), label: `Your setup (${describeSetup(current)})`, settings: current };
  const others = PRESETS.filter((p) => setupId(p.settings) !== mine.id).map((p) => ({
    id: setupId(p.settings),
    label: `${p.label} (${describeSetup(p.settings)})`,
    settings: p.settings,
  }));
  return [mine, ...others];
}
