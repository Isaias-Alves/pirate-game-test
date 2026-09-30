import type { Page } from '@playwright/test';
import { chooseScenario, expect, goToLastPage, idleUntilEnd, startMatch, test, type Options } from './support';

const OPTS: Options = { sessionSeconds: 120, spawnInterval: 3 };

const storedMatches = (page: Page) =>
  page.evaluate(() => {
    const raw = window.localStorage.getItem('pirate-battle:mock-db:v1');
    return raw ? (JSON.parse(raw) as { matches: { matchId: string }[] }).matches : [];
  });

const pendingCount = (page: Page) =>
  page.evaluate(() => (JSON.parse(window.localStorage.getItem('pirate-battle:pending:v1') ?? '[]') as unknown[]).length);

/** Total records the (mock) server holds for this player, asked through the real API. */
const serverHistoryTotal = (page: Page) =>
  page.evaluate(async () => {
    const player = JSON.parse(window.localStorage.getItem('pirate-battle:player:v1') ?? '{}') as { id?: string };
    const res = await fetch(`/api/players/${encodeURIComponent(player.id ?? '')}/matches?page=1&pageSize=50`);
    return ((await res.json()) as { total: number }).total;
  });

test.describe('Consistency under failures', () => {
  test('a timeout after the server saved the match is retried without creating a duplicate', async ({ page }) => {
    await startMatch(page, { options: OPTS, gameSeed: 1, scenario: 'submit-timeout' });
    await idleUntilEnd(page);

    // The server stored the match but the reply never comes: the client gives up and keeps it pending.
    const status = page.getByTestId('record-status');
    await expect(status).toHaveAttribute('data-state', 'failed', { timeout: 15_000 });
    await expect(status).toContainText('took too long');
    expect(await storedMatches(page)).toHaveLength(1); // saved on the server already
    expect(await pendingCount(page)).toBe(1);

    // The connection recovers; the retry gets the existing record back instead of adding another.
    await page.evaluate(() => {
      const raw = window.localStorage.getItem('pirate-battle:mock-settings:v1');
      const s = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      window.localStorage.setItem('pirate-battle:mock-settings:v1', JSON.stringify({ ...s, scenario: 'success' }));
    });
    await page.getByTestId('record-retry').click();
    await expect(status).toHaveAttribute('data-state', 'confirmed');
    expect(await storedMatches(page)).toHaveLength(1);
    expect(await serverHistoryTotal(page)).toBe(1);

    await page.getByTestId('main-menu').click();
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await page.getByTestId('tab-ranking').click();
    await expect(page.getByTestId('board-count')).toContainText('35 matches'); // 34 others + this one, once
    await goToLastPage(page);
    await expect(page.locator('tr.is-me')).toHaveCount(1);
  });

  test('repeated clicks on Try again send the match only once', async ({ page }) => {
    await startMatch(page, { options: OPTS, gameSeed: 1, scenario: 'submit-unavailable' });
    await idleUntilEnd(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'failed');
    await page.evaluate(() => {
      const raw = window.localStorage.getItem('pirate-battle:mock-settings:v1');
      const s = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      window.localStorage.setItem('pirate-battle:mock-settings:v1', JSON.stringify({ ...s, scenario: 'success', latencyScale: 1 }));
    });
    const retry = page.getByTestId('record-retry');
    // Hammer the button: the first click starts sending, the rest must not start more requests.
    await retry.click({ clickCount: 5, delay: 10 });
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'confirmed');
    expect(await storedMatches(page)).toHaveLength(1);
    expect(await serverHistoryTotal(page)).toBe(1);
  });

  test('a late, older response never replaces newer list data when paging quickly', async ({ page }) => {
    // Each request is faster than the one before it, so the answer to an earlier click arrives after a later one.
    await startMatch(page, { scenario: 'paginated' });
    await page.keyboard.press('Escape');
    await page.getByTestId('quit').click();
    await page.evaluate(() => {
      const raw = window.localStorage.getItem('pirate-battle:mock-settings:v1');
      const s = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      window.localStorage.setItem('pirate-battle:mock-settings:v1', JSON.stringify({ ...s, scenario: 'out-of-order', latencyScale: 1 }));
    });
    await chooseScenario(page, 'out-of-order'); // resets the lists so the first request is the slow one
    await expect(page.getByTestId('page-label')).toHaveText(/Page 1 of/, { timeout: 8_000 });

    await page.getByTestId('next-page').click(); // page 2: slower answer
    await expect(page.getByTestId('page-label')).toContainText('Page 2');
    await page.getByTestId('next-page').click(); // page 3: faster answer, arrives first
    // Whatever order the replies land in, the screen ends on page 3 with page 3's rows.
    await expect(page.getByTestId('page-label')).toContainText('Page 3', { timeout: 8_000 });
    await page.waitForTimeout(3_500); // let the slow page-2 reply arrive
    await expect(page.getByTestId('page-label')).toContainText('Page 3');
    const ranks = (await page.getByTestId('ranking-row').locator('td:first-child').allTextContents()).map(Number);
    expect(ranks[0]).toBe(17);
  });

  test('recording a match while the ranking is loading slowly still ends with the new match listed', async ({ page }) => {
    await startMatch(page, { options: OPTS, gameSeed: 1 });
    await idleUntilEnd(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'confirmed');
    await page.getByTestId('main-menu').click();

    // Slow, out-of-order network from here on; open the ranking (a slow request), then play and record another match.
    await page.evaluate(() => {
      const raw = window.localStorage.getItem('pirate-battle:mock-settings:v1');
      const s = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      window.localStorage.setItem('pirate-battle:mock-settings:v1', JSON.stringify({ ...s, scenario: 'out-of-order', latencyScale: 1 }));
    });
    await chooseScenario(page, 'out-of-order');
    await page.getByTestId('play').click();
    await page.waitForFunction(() => window.__game !== undefined);
    await idleUntilEnd(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'confirmed', { timeout: 15_000 });
    await page.getByTestId('main-menu').click();
    await page.waitForTimeout(3_000); // let every in-flight reply land
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(2, { timeout: 10_000 });
    await page.getByTestId('tab-ranking').click();
    await expect(page.getByTestId('board-count')).toContainText('36 matches', { timeout: 10_000 });
    await goToLastPage(page);
    await expect(page.locator('tr.is-me')).toHaveCount(2);
  });
});
