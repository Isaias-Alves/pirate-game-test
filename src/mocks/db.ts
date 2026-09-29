import type { MatchRecord, MatchSettings, Page, RankingEntry } from '../api/contracts';
import { parseRecord } from '../api/validate';
import { isRecord } from '../storage/localStore';
import { extraFixturesFor, fixturesFor, syntheticHistory } from './fixtures';

export interface StoredDb {
  revision: number;
  /** Matches confirmed for the local player (everything else comes from fixtures). */
  matches: MatchRecord[];
}

export interface DbStorage {
  read(): unknown;
  write(state: StoredDb): void;
  clear(): void;
}

/** Which standing data is visible; chosen per request from the active scenario. */
export interface DataView {
  fixtures: boolean;
  extraFixtures: boolean;
  syntheticHistory: boolean;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

const sameSettings = (a: MatchSettings, b: MatchSettings): boolean => a.sessionSeconds === b.sessionSeconds && a.spawnInterval === b.spawnInterval;

/**
 * Deterministic ranking order: higher score first; then a match that ran its full time beats one that
 * ended in a sinking; then the earlier match; finally matchId so the order is total.
 */
export function compareRanking(a: MatchRecord, b: MatchRecord): number {
  if (a.score !== b.score) return b.score - a.score;
  if (a.endReason !== b.endReason) return a.endReason === 'time' ? -1 : 1;
  if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? -1 : 1;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

/** History order: newest first, matchId as the final tiebreak. */
export function compareHistory(a: MatchRecord, b: MatchRecord): number {
  if (a.playedAt !== b.playedAt) return a.playedAt < b.playedAt ? 1 : -1;
  return a.matchId < b.matchId ? -1 : a.matchId > b.matchId ? 1 : 0;
}

function paginate<T>(all: T[], page: number, pageSize: number, revision: number): Page<T> {
  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize;
  return { items: all.slice(start, start + pageSize), page, pageSize, total, totalPages, revision };
}

/** The mock "server": records live here and survive reloads through the storage adapter. */
export class MockDb {
  private state: StoredDb;

  constructor(private readonly storage: DbStorage) {
    this.state = this.load();
  }

  private load(): StoredDb {
    const raw = this.storage.read();
    if (isRecord(raw) && isNum(raw.revision) && Array.isArray(raw.matches)) {
      const matches = raw.matches.map(parseRecord).filter((r): r is MatchRecord => typeof r !== 'string');
      return { revision: raw.revision, matches };
    }
    return { revision: 1, matches: [] };
  }

  get revision(): number {
    return this.state.revision;
  }

  /** Confirmed matches (what the local player has actually recorded). */
  get confirmed(): readonly MatchRecord[] {
    return this.state.matches;
  }

  /** Creates the record, or returns the existing one when `matchId` was already recorded. */
  submit(record: MatchRecord): { record: MatchRecord; created: boolean } {
    const existing = this.state.matches.find((m) => m.matchId === record.matchId);
    if (existing) return { record: existing, created: false };
    this.state = { revision: this.state.revision + 1, matches: [...this.state.matches, record] };
    this.storage.write(this.state);
    return { record, created: true };
  }

  reset(): void {
    this.state = { revision: 1, matches: [] };
    this.storage.clear();
  }

  private standing(settings: MatchSettings, view: DataView): MatchRecord[] {
    if (!view.fixtures) return [];
    return [...fixturesFor(settings), ...(view.extraFixtures ? extraFixturesFor(settings) : [])];
  }

  ranking(settings: MatchSettings, page: number, pageSize: number, view: DataView): Page<RankingEntry> {
    const pool = [...this.standing(settings, view), ...this.state.matches].filter((m) => sameSettings(m.settings, settings));
    pool.sort(compareRanking);
    const ranked: RankingEntry[] = pool.map((m, i) => ({ ...m, rank: i + 1 }));
    return paginate(ranked, page, pageSize, this.state.revision);
  }

  history(playerId: string, playerName: string, page: number, pageSize: number, view: DataView): Page<MatchRecord> {
    const own = this.state.matches.filter((m) => m.playerId === playerId);
    const synthetic = view.syntheticHistory ? syntheticHistory(playerId, playerName) : [];
    const all = [...own, ...synthetic].sort(compareHistory);
    return paginate(all, page, pageSize, this.state.revision);
  }
}
