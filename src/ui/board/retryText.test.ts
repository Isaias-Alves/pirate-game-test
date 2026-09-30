import { describe, expect, it } from 'vitest';
import { loadingText, refreshText } from './retryText';

describe('list loading copy', () => {
  it('is plain on the first attempt', () => {
    expect(loadingText('the ranking', 0, 3)).toBe('Loading the ranking…');
  });

  it('names the running attempt after a failure, never past the last one', () => {
    expect(loadingText('the ranking', 1, 3)).toBe('Loading the ranking… No answer yet, trying again (attempt 2 of 3).');
    expect(loadingText('the ranking', 2, 3)).toContain('attempt 3 of 3');
    expect(loadingText('the ranking', 5, 3)).toContain('attempt 3 of 3');
  });

  it('tells a background refresh that is retrying apart from a normal one', () => {
    expect(refreshText(false, 0)).toBe('up to date');
    expect(refreshText(true, 0)).toBe('updating…');
    expect(refreshText(true, 1)).toBe('updating… (retrying)');
  });
});
