/**
 * Copy for a list that is loading. After a failed attempt it says so and which attempt is running, so a slow or
 * flaky server reads as "retrying", not as a frozen spinner.
 */
export function loadingText(what: string, failureCount: number, maxAttempts: number): string {
  if (failureCount <= 0) return `Loading ${what}…`;
  const attempt = Math.min(failureCount + 1, maxAttempts);
  return `Loading ${what}… No answer yet, trying again (attempt ${String(attempt)} of ${String(maxAttempts)}).`;
}

/** Suffix for the "N matches · …" line during a background refresh. */
export function refreshText(isFetching: boolean, failureCount: number): string {
  if (!isFetching) return 'up to date';
  return failureCount > 0 ? 'updating… (retrying)' : 'updating…';
}
