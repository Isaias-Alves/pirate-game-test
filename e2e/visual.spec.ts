import { advance, expect, makeDurable, openMenu, startMatch, test } from './support';

/**
 * Visual regression. Baselines live in e2e/__screenshots__/<project>/ and are versioned with the code.
 * Everything that could vary is pinned: seeded simulation on a manual clock, instant mock API, fixed
 * fixture data and dates, reduced motion, and animations disabled by the screenshot assertion.
 */
test.describe('Visual regression', () => {
  test('main menu', async ({ page }) => {
    await openMenu(page);
    await expect(page.getByTestId('ranking-row').first()).toBeVisible();
    await expect(page).toHaveScreenshot('menu.png', { fullPage: true });
  });

  test('arena in a stable state', async ({ page }) => {
    await startMatch(page, { gameSeed: 1 });
    await advance(page, 4); // a Chaser has just appeared and is still far away
    await page.waitForTimeout(600); // let the renderer settle on the final frame
    await expect(page.getByTestId('screen-match')).toHaveScreenshot('arena.png');
  });

  test('arena with touch controls', async ({ page }) => {
    await startMatch(page, { gameSeed: 1, touch: true });
    await advance(page, 4);
    await page.waitForTimeout(600);
    await expect(page.getByTestId('screen-match')).toHaveScreenshot('arena-touch.png');
  });

  test('pause dialog', async ({ page }) => {
    await startMatch(page, { gameSeed: 1 });
    await advance(page, 2);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.getByTestId('screen-match')).toHaveScreenshot('pause.png');
  });

  test('result screen', async ({ page }) => {
    await startMatch(page, { gameSeed: 1, options: { sessionSeconds: 60, spawnInterval: 10 } });
    await makeDurable(page);
    await advance(page, 61);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'confirmed');
    await page.waitForTimeout(1500); // explosion/shake effects triggered during the fast-forward are over
    await expect(page.getByTestId('screen-match')).toHaveScreenshot('result.png');
  });

  test('options screen', async ({ page }) => {
    await openMenu(page);
    await page.getByTestId('options').click();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();
    await expect(page).toHaveScreenshot('options.png', { fullPage: true });
  });
});
