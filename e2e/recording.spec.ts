import { chooseScenario, expect, goToLastPage, idleUntilEnd, openMenu, startMatch, test, type Options } from './support';
import type { Page } from '@playwright/test';

const OPTS: Options = { sessionSeconds: 120, spawnInterval: 3 };

const storedMatches = (page: Page) =>
  page.evaluate(() => {
    const raw = window.localStorage.getItem('pirate-battle:mock-db:v1');
    return raw ? (JSON.parse(raw) as { matches: { matchId: string; score: number }[] }).matches : [];
  });

const pendingCount = (page: Page) =>
  page.evaluate(() => {
    const raw = window.localStorage.getItem('pirate-battle:pending:v1');
    return raw ? (JSON.parse(raw) as unknown[]).length : 0;
  });

test.describe('Recording finished matches', () => {
  test('a finished match is recorded once and shows up in both tabs', async ({ page, errors }) => {
    await startMatch(page, { options: OPTS, gameSeed: 1 });
    const end = await idleUntilEnd(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'confirmed');
    await expect(page.getByTestId('record-status')).toContainText('recorded');

    await page.getByTestId('main-menu').click();
    // History tab: exactly one match, with the played score.
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('history-row').locator('td.num').first()).toHaveText(String(end.score));
    await expect(page.getByTestId('history-row')).toContainText('Ship sunk');
    // Ranking tab: 34 other matches plus this one. A score of 0 ranks last, so look on the last page.
    await page.getByTestId('tab-ranking').click();
    await expect(page.getByTestId('board-count')).toContainText('35 matches');
    await goToLastPage(page);
    await expect(page.locator('tr.is-me')).toHaveCount(1);
    expect(await storedMatches(page)).toHaveLength(1);
    expect(await pendingCount(page)).toBe(0);
    expect(errors).toEqual([]);
  });

  test('two matches in a row are two records, each recorded once', async ({ page }) => {
    await startMatch(page, { options: OPTS, gameSeed: 1 });
    await idleUntilEnd(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'confirmed');
    await page.getByTestId('play-again').click();
    await idleUntilEnd(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'confirmed');
    expect(await storedMatches(page)).toHaveLength(2);
    await page.getByTestId('main-menu').click();
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(2);
  });

  test('when recording is unavailable the result says so, is kept, survives a refresh and is sent after recovery', async ({ page }) => {
    await startMatch(page, { options: OPTS, gameSeed: 1, scenario: 'submit-unavailable' });
    await idleUntilEnd(page);
    const status = page.getByTestId('record-status');
    await expect(status).toHaveAttribute('data-state', 'failed');
    await expect(status).toContainText('Could not record this match');
    expect(await pendingCount(page)).toBe(1);
    expect(await storedMatches(page)).toHaveLength(0);

    // The player can go on: the menu offers to send it later and a new match can start right away.
    await page.getByTestId('play-again').click();
    await expect.poll(() => page.evaluate(() => window.__game?.currentPhase)).toBe('playing');
    await page.reload();
    await expect(page.getByTestId('screen-menu')).toBeVisible();
    await expect(page.getByTestId('pending-banner')).toContainText('1 finished match is not recorded yet');
    await expect(page.getByTestId('pending-retry')).toHaveText('Send now'); // the automatic attempt has failed too
    expect(await pendingCount(page)).toBe(1); // the abandoned second match was never queued

    // The service recovers; "Send now" records it.
    await chooseScenario(page, 'success');
    await page.getByTestId('pending-retry').click();
    await expect(page.getByTestId('pending-banner')).toHaveCount(0);
    expect(await pendingCount(page)).toBe(0);
    expect(await storedMatches(page)).toHaveLength(1);
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
  });

  test('the result dialog can retry after a failure and shows success', async ({ page }) => {
    await startMatch(page, { options: OPTS, gameSeed: 1, scenario: 'submit-unavailable' });
    await idleUntilEnd(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'failed');
    // Recovery happens behind the scenes (the scenario is changed through the mock controls' storage key).
    await page.evaluate(() => {
      const raw = window.localStorage.getItem('pirate-battle:mock-settings:v1');
      const s = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      window.localStorage.setItem('pirate-battle:mock-settings:v1', JSON.stringify({ ...s, scenario: 'success' }));
    });
    await page.getByTestId('record-retry').click();
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'confirmed');
    expect(await storedMatches(page)).toHaveLength(1);
  });

  test('a flaky server that fails twice is retried automatically until it works', async ({ page }) => {
    // The e2e build allows 1 automatic retry, so two 503s end as a failure and the third try (manual) succeeds.
    await startMatch(page, { options: OPTS, gameSeed: 1, scenario: 'submit-flaky' });
    await idleUntilEnd(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'failed');
    await page.getByTestId('record-retry').click();
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'confirmed');
    expect(await storedMatches(page)).toHaveLength(1);
  });

  test('resetting the mock data restores the initial state', async ({ page }) => {
    await startMatch(page, { options: OPTS, gameSeed: 1 });
    await idleUntilEnd(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'confirmed');
    await page.getByTestId('main-menu').click();
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);

    await chooseScenario(page, 'http-5xx');
    await page.getByTestId('reset-mocks').click();
    await page.getByTestId('reset-mocks-confirm').click();
    await expect(page.getByTestId('mock-note')).toContainText('reset');
    await expect(page.getByTestId('scenario-select')).toHaveValue('success');
    expect(await storedMatches(page)).toHaveLength(0);
    await expect(page.getByTestId('board-empty')).toBeVisible();
  });

  test('the scenario selector is visible, labelled and describes the chosen scenario', async ({ page }) => {
    await openMenu(page);
    const select = page.getByLabel('Scenario');
    await expect(select).toBeVisible();
    expect(await select.locator('option').count()).toBeGreaterThanOrEqual(15);
    await select.selectOption('submit-timeout');
    await expect(page.getByTestId('scenario-description')).toContainText('never arrives');
  });
});
