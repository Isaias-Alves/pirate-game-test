import axios, { isAxiosError } from 'axios';
import { apiConfig } from './config';

export const http = axios.create({
  baseURL: apiConfig.baseURL,
  timeout: apiConfig.timeoutMs,
  headers: { Accept: 'application/json' },
});

/** True for failures that may succeed on a retry: no response (network/timeout) or a 5xx. Never 4xx. */
export function isRetryable(error: unknown): boolean {
  if (!isAxiosError(error)) return false;
  if (error.code === 'ERR_CANCELED') return false;
  const status = error.response?.status;
  return status === undefined || status >= 500;
}

/** A short, user-facing reason for a failed request. */
export function describeError(error: unknown): string {
  if (!isAxiosError(error)) return 'Something went wrong.';
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'The server took too long to answer.';
  const status = error.response?.status;
  if (status === undefined) return 'Could not reach the server.';
  if (status >= 500) return 'The server is having trouble right now.';
  return 'The server rejected the request.';
}
