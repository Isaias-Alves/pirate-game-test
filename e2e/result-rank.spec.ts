import { expect, goToLastPage, idleUntilEnd, startMatch, test } from './support';

test.describe('Ranking position on the result screen', () => {
  test('once recorded, the result shows where the match landed for its setup', async ({ page, errors }) => {
    await startMatch(page, { options: { sessionSeconds: 120, spawnInterval: 3 }, gameSeed: 1 });
    const end = await idleUntilEnd(page);
    const status = page.getByTestId('record-status');
    await expect(status).toHaveAttribute('data-state', 'confirmed');
    // 34 fixture matches share this setup; an idle match scores last among them (ties go to the earlier match).
    await expect(page.getByTestId('record-rank')).toHaveText(end.score === 0 ? '#35 of 35' : /^#\d+ of 35$/);
    await expect(status).toContainText('for this setup');
    expect(errors).toEqual([]);
  });

  test('the position also appears after a failed recording is retried', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 60, spawnInterval: 3 }, gameSeed: 1, scenario: 'submit-unavailable' });
    await idleUntilEnd(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'failed');
    await expect(page.getByTestId('record-rank')).toHaveCount(0);
    await page.evaluate(() => {
      const raw = window.localStorage.getItem('pirate-battle:mock-settings:v1');
      const s = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      window.localStorage.setItem('pirate-battle:mock-settings:v1', JSON.stringify({ ...s, scenario: 'success' }));
    });
    await page.getByTestId('record-retry').click();
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'confirmed');
    await expect(page.getByTestId('record-rank')).toHaveText(/^#\d+ of 19$/); // 18 fixtures + this match
  });

  test('the ranking tab agrees with the position shown on the result', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 60, spawnInterval: 3 }, gameSeed: 1 });
    await idleUntilEnd(page);
    const rankText = (await page.getByTestId('record-rank').textContent()) ?? '';
    const position = Number(/#(\d+)/.exec(rankText)?.[1]);
    await page.getByTestId('main-menu').click();
    await expect(page.getByTestId('board-count')).toContainText('19 matches');
    // An idle match scores low, so it sits on the last page of this setup's ranking.
    await goToLastPage(page);
    await expect(page.locator('tr.is-me').locator('td').first()).toHaveText(String(position));
  });
});
