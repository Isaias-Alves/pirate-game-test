import { useId, useState, type ReactNode } from 'react';
import type { MatchRecord, MatchSettings, Page } from '../../api/contracts';
import { describeError } from '../../api/http';
import { useHistory, useRanking } from '../../api/hooks';
import { loadOptions } from '../../storage/options';
import { getPlayer } from '../../storage/player';
import { END_REASON_TEXT, formatClock, formatDate } from '../format';
import { apiConfig } from '../../api/config';
import { loadingText, refreshText } from './retryText';
import { describeSetup, rankingSetups } from './setups';

interface QueryLike<T> {
  data: Page<T> | undefined;
  isPending: boolean;
  isError: boolean;
  isFetching: boolean;
  isPlaceholderData: boolean;
  /** Failed attempts of the current fetch (TanStack Query counts them while it retries). */
  failureCount: number;
  error: unknown;
  refetch: () => unknown;
}

/** `page` is the page the user asked for, so the label and buttons react at once even while that page is still loading. */
function Pager({ page, totalPages, onPage }: { page: number; totalPages: number; onPage: (p: number) => void }) {
  return (
    <nav className="pager" aria-label="Pagination">
      <button
        type="button"
        className="pager__btn"
        disabled={page <= 1}
        onClick={() => {
          onPage(page - 1);
        }}
        data-testid="prev-page"
      >
        Previous
      </button>
      <span className="pager__label" aria-live="polite" data-testid="page-label">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="pager__btn"
        disabled={page >= totalPages}
        onClick={() => {
          onPage(page + 1);
        }}
        data-testid="next-page"
      >
        Next
      </button>
    </nav>
  );
}

/** Shared loading / error / empty / data shell for both list tabs. */
function ListShell<T>({
  query,
  page,
  onPage,
  emptyText,
  what,
  children,
}: {
  query: QueryLike<T>;
  page: number;
  onPage: (p: number) => void;
  emptyText: string;
  what: string;
  children: (items: T[], data: Page<T>) => ReactNode;
}) {
  const { data } = query;
  if (query.isPending) {
    return (
      <p className="board__status" role="status" data-testid="board-loading">
        {loadingText(what, query.failureCount, apiConfig.retries + 1)}
      </p>
    );
  }
  if (query.isError && !data) {
    return (
      <div className="board__status board__status--error" role="alert" data-testid="board-error">
        <p>Could not load {what}. {describeError(query.error)}</p>
        <button
          type="button"
          className="pager__btn"
          onClick={() => {
            void query.refetch();
          }}
          data-testid="board-retry"
        >
          Try again
        </button>
      </div>
    );
  }
  if (!data) return null;
  if (data.total === 0) {
    return (
      <p className="board__status" data-testid="board-empty">
        {emptyText}
      </p>
    );
  }
  return (
    <div className="board__list" aria-busy={query.isFetching}>
      {query.isError && (
        <p className="board__stale" role="status">
          Showing saved results. Could not refresh right now.{' '}
          <button
            type="button"
            className="linklike"
            onClick={() => {
              void query.refetch();
            }}
          >
            Try again
          </button>
        </p>
      )}
      {children(data.items, data)}
      <Pager page={page} totalPages={data.totalPages} onPage={onPage} />
      <p className="board__hint" data-testid="board-count">
        {data.total} {data.total === 1 ? 'match' : 'matches'} · {refreshText(query.isFetching, query.failureCount)}
      </p>
    </div>
  );
}

/**
 * When the list shrinks under the current page (mock reset, another scenario, fewer records) jump to its last
 * page instead of showing "Page 8 of 3" with no rows. Adjusting state during render is React's recommended
 * way to derive state from new data.
 */
function clampPage(page: number, query: { data: Page<unknown> | undefined; isPlaceholderData: boolean }, setPage: (p: number) => void): void {
  const last = query.data?.totalPages;
  if (last !== undefined && !query.isPlaceholderData && page > last) setPage(last);
}

const settingsText = (s: MatchSettings) => `${String(s.sessionSeconds)} s session · enemy every ${String(s.spawnInterval)} s`;

/** Ranking tab: pick a setup (default: the player's own), then a paged table for that setup only. */
export function RankingPanel() {
  const current = useCurrentSettings();
  const [setups] = useState(() => rankingSetups(current));
  const [setupIndex, setSetupIndex] = useState(0);
  const selectId = useId();
  const chosen = setups[setupIndex] ?? setups[0];
  if (!chosen) return null;
  return (
    <div data-testid="ranking-panel">
      <div className="board__setup">
        <label htmlFor={selectId}>Setup</label>
        <select
          id={selectId}
          className="board__select"
          value={setupIndex}
          data-testid="ranking-setup"
          onChange={(e) => {
            setSetupIndex(Number(e.target.value));
          }}
        >
          {setups.map((s, i) => (
            <option key={s.id} value={i}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      {/* Keyed by setup, so paging restarts at page 1 for every setup. */}
      <RankingList key={chosen.id} settings={chosen.settings} />
    </div>
  );
}

function RankingList({ settings }: { settings: MatchSettings }) {
  const [page, setPage] = useState(1);
  const query = useRanking(settings, page);
  clampPage(page, query, setPage);
  const me = getPlayer().id;
  const captionId = useId();
  return (
    <>
      <p className="board__note" id={captionId} data-testid="ranking-note">
        Best matches played with <strong>{describeSetup(settings)}</strong>. Only matches with the same setup are compared.
      </p>
      <ListShell query={query} page={page} onPage={setPage} what="the ranking" emptyText="No matches recorded for this setup yet. Be the first!">
        {(items) => (
          <table className="board__table" aria-describedby={captionId}>
            <caption className="sr-only">Ranking</caption>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Player</th>
                <th scope="col" className="num">
                  Score
                </th>
                <th scope="col" className="num hide-narrow">
                  Time
                </th>
                <th scope="col" className="hide-narrow">
                  Ended
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.matchId} className={e.playerId === me ? 'is-me' : undefined} data-testid="ranking-row">
                  <td>{e.rank}</td>
                  <th scope="row">
                    {e.playerName}
                    {e.playerId === me && <span className="sr-only"> (you)</span>}
                  </th>
                  <td className="num">{e.score}</td>
                  <td className="num hide-narrow">{formatClock(e.durationSeconds)}</td>
                  <td className="hide-narrow">{END_REASON_TEXT[e.endReason]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListShell>
    </>
  );
}

export function HistoryPanel() {
  const player = getPlayer();
  const [page, setPage] = useState(1);
  const query = useHistory(player.id, page);
  clampPage(page, query, setPage);
  return (
    <div data-testid="history-panel">
      <ListShell
        query={query}
        page={page}
        onPage={setPage}
        what="your match history"
        emptyText="You have not finished a match yet. Play one and it will show up here."
      >
        {(items: MatchRecord[]) => (
          <table className="board__table">
            <caption className="sr-only">Your matches, newest first</caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col" className="num">
                  Score
                </th>
                <th scope="col" className="num">
                  Time
                </th>
                <th scope="col">Ended</th>
                <th scope="col" className="hide-narrow">
                  Setup
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.matchId} data-testid="history-row">
                  <th scope="row">{formatDate(m.playedAt)}</th>
                  <td className="num">{m.score}</td>
                  <td className="num">{formatClock(m.durationSeconds)}</td>
                  <td>{END_REASON_TEXT[m.endReason]}</td>
                  <td className="hide-narrow">{settingsText(m.settings)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ListShell>
    </div>
  );
}

/** The setup whose ranking is shown: whatever the player currently has saved in Options. */
function useCurrentSettings(): MatchSettings {
  const [settings] = useState(() => {
    const o = loadOptions();
    return { sessionSeconds: o.sessionSeconds, spawnInterval: o.spawnInterval };
  });
  return settings;
}
