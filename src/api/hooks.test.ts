import { QueryClient, QueryObserver } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import type { Page } from './contracts';
import { newestWins } from './hooks';

const page = (revision: number, marker: string): Page<string> => ({ items: [marker], page: 1, pageSize: 8, total: 1, totalPages: 1, revision });

describe('newestWins (stale-response guard)', () => {
  it('keeps cached data when the incoming response is older', () => {
    const cached = page(5, 'new');
    expect(newestWins(cached, page(3, 'old'))).toBe(cached);
  });

  it('accepts equal or newer revisions', () => {
    const incoming = page(5, 'same');
    expect(newestWins(page(5, 'a'), incoming)).toBe(incoming);
    const newer = page(6, 'newer');
    expect(newestWins(page(5, 'a'), newer)).toBe(newer);
  });

  it('accepts anything when nothing is cached or the shape is unknown', () => {
    const incoming = page(1, 'first');
    expect(newestWins(undefined, incoming)).toBe(incoming);
    expect(newestWins('x', 'y')).toBe('y');
  });

  it('protects a live query: a late old response cannot replace newer cached data', async () => {
    const client = new QueryClient();
    const key = ['ranking', 120, 3, 1];
    const observer = new QueryObserver<Page<string>>(client, { queryKey: key, queryFn: () => page(2, 'new'), structuralSharing: newestWins });
    const unsubscribe = observer.subscribe(() => undefined);
    await observer.refetch();
    expect(client.getQueryData<Page<string>>(key)?.items[0]).toBe('new');

    // Simulate a slow request finishing after the newer one.
    client.setQueryData(key, page(1, 'old-late'));
    expect(client.getQueryData<Page<string>>(key)?.items[0]).toBe('new');
    unsubscribe();
    client.clear();
  });
});
