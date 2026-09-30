import { chooseScenario, expect, openMenu, test } from './support';

const rows = (page: import('@playwright/test').Page, kind: 'ranking' | 'history') => page.getByTestId(`${kind}-row`);

test.describe('Ranking and Match History lists', () => {
  test('ranking shows ordered, ranked rows and pages through many pages', async ({ page, errors }) => {
    await openMenu(page, { scenario: 'paginated' });
    await expect(rows(page, 'ranking')).toHaveCount(8);
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 10');

    const scores = async () => (await rows(page, 'ranking').locator('td.num').allTextContents()).filter((_, i) => i % 2 === 0).map(Number);
    const ranksOn = async () => (await rows(page, 'ranking').locator('td:first-child').allTextContents()).map(Number);

    expect(await ranksOn()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    const first = await scores();
    expect([...first].sort((a, b) => b - a)).toEqual(first); // best score first

    await page.getByTestId('next-page').click();
    await expect(page.getByTestId('page-label')).toHaveText('Page 2 of 10');
    await expect.poll(ranksOn).toEqual([9, 10, 11, 12, 13, 14, 15, 16]);
    expect((await scores())[0]).toBeLessThanOrEqual(first[first.length - 1] ?? 0); // continues where page 1 ended

    await page.getByTestId('prev-page').click();
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 10');
    await expect(page.getByTestId('prev-page')).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test('match history is empty until a match is recorded, then paginates', async ({ page }) => {
    await openMenu(page);
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('board-empty')).toContainText('not finished a match yet');

    await chooseScenario(page, 'paginated');
    await expect(rows(page, 'history')).toHaveCount(8);
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 4');
    await page.getByTestId('next-page').click();
    await page.getByTestId('next-page').click();
    await page.getByTestId('next-page').click();
    await expect(page.getByTestId('page-label')).toHaveText('Page 4 of 4');
    await expect(rows(page, 'history')).toHaveCount(1);
    await expect(page.getByTestId('next-page')).toBeDisabled();
    // Each row shows date, score, time, why it ended and the setup it used.
    await expect(page.locator('thead th')).toContainText(['Date', 'Score', 'Time', 'Ended', 'Setup']);
  });

  test('shows a loading state while the data is on its way', async ({ page }) => {
    await openMenu(page, { scenario: 'slow', latency: 1 });
    await expect(page.getByTestId('board-loading')).toBeVisible();
    await expect(page.getByTestId('board-loading')).toContainText('Loading the ranking');
    await expect(rows(page, 'ranking').first()).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId('board-loading')).toHaveCount(0);
  });

  test('shows an empty state when there is nothing to list', async ({ page }) => {
    await openMenu(page, { scenario: 'empty' });
    await expect(page.getByTestId('board-empty')).toContainText('No matches recorded for this setup yet');
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('board-empty')).toBeVisible();
  });

  test('shows an accessible error with a working Try again', async ({ page }) => {
    await openMenu(page, { scenario: 'http-5xx' });
    const error = page.getByTestId('board-error');
    await expect(error).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not load the ranking' })).toBeVisible();
    // Still failing: retry keeps the error.
    await page.getByTestId('board-retry').click();
    await expect(error).toBeVisible();

    await chooseScenario(page, 'success'); // recovery
    await expect(rows(page, 'ranking').first()).toBeVisible();
    await expect(error).toHaveCount(0);
  });

  test('a failing list never blocks the rest of the game', async ({ page }) => {
    await openMenu(page, { scenario: 'network-error' });
    await expect(page.getByTestId('board-error')).toBeVisible();
    // Options and Play still work.
    await page.getByTestId('options').click();
    await expect(page.getByTestId('screen-options')).toBeVisible();
    await page.getByTestId('back').click();
    await page.getByTestId('play').click();
    await page.waitForFunction(() => window.__game !== undefined);
    await expect(page.getByTestId('screen-match')).toBeVisible();
  });

  test('each failure mode reaches the UI as an error with a reason', async ({ page }) => {
    await openMenu(page, { scenario: 'success' });
    for (const [scenario, text] of [
      ['http-4xx', 'rejected the request'],
      ['http-5xx', 'having trouble'],
      ['network-error', 'Could not reach the server'],
      ['timeout', 'took too long'],
      ['ranking-fails', 'having trouble'],
    ] as const) {
      await chooseScenario(page, scenario);
      await expect(page.getByTestId('board-error')).toContainText(text, { timeout: 10_000 });
    }
    // History-only failure leaves the ranking healthy.
    await chooseScenario(page, 'history-fails');
    await expect(rows(page, 'ranking').first()).toBeVisible();
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('board-error')).toBeVisible();
  });

  test('switching tabs shows current data again', async ({ page }) => {
    await openMenu(page, { scenario: 'paginated' });
    await expect(rows(page, 'ranking')).toHaveCount(8);
    await page.getByTestId('next-page').click();
    await expect(page.getByTestId('page-label')).toHaveText('Page 2 of 10');
    await page.getByTestId('tab-history').click();
    await expect(rows(page, 'history')).toHaveCount(8);
    await page.getByTestId('tab-ranking').click();
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 10'); // the panel was rebuilt and re-fetched
    await expect(rows(page, 'ranking')).toHaveCount(8);
  });
});
