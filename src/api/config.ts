/**
 * Network tuning. Defaults suit real use; end-to-end builds (`vite build --mode e2e`) override them through
 * VITE_* variables so timeouts and retries take milliseconds instead of many seconds.
 */
const num = (raw: unknown, fallback: number): number => {
  const n = typeof raw === 'string' && raw !== '' ? Number(raw) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
};

export const apiConfig = {
  baseURL: '/api',
  /** Axios request timeout. */
  timeoutMs: num(import.meta.env.VITE_API_TIMEOUT_MS, 4000),
  /** Automatic retries for reads and for the (idempotent) match submission. */
  retries: num(import.meta.env.VITE_API_RETRIES, 2),
  /** First retry delay; doubles each attempt. */
  retryBaseMs: num(import.meta.env.VITE_API_RETRY_BASE_MS, 600),
} as const;
