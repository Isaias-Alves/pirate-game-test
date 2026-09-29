import { QueryClient } from '@tanstack/react-query';
import { apiConfig } from './config';
import { isRetryable } from './http';

/** Exponential backoff: base, 2x base, 4x base ... */
export const retryDelay = (attempt: number): number => apiConfig.retryBaseMs * 2 ** attempt;

/** Retry only what can plausibly succeed later (network/timeout/5xx), and only a few times. */
export const shouldRetry = (failureCount: number, error: unknown): boolean => failureCount < apiConfig.retries && isRetryable(error);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: shouldRetry,
      retryDelay,
      // Always re-check when a list is shown again or the window regains focus; keep old rows while doing so.
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      gcTime: 5 * 60_000,
    },
    mutations: { retry: shouldRetry, retryDelay },
  },
});
