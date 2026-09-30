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
    // The menu scrolls inside `.scene` (not the document), so `fullPage` only sees the first screen:
    // capture the bottom too (end of the controls legend, network simulation panel).
    await page.locator('.scene').evaluate((el) => {
      el.scrollTo(0, el.scrollHeight);
    });
    await expect(page).toHaveScreenshot('menu-bottom.png');
  });

  test('arena in a stable state', async ({ page }) => {
    await startMatch(page, { gameSeed: 1 });
    await advance(page, 4); // a Chaser has just appeared and is still far away
    await page.waitForTimeout(600); // let the renderer settle on the final frame
    await expect(page.getByTestId('screen-match')).toHaveScreenshot('arena.png');
  });

  test('damaged ships: damage-stage art, fire on deck and low health bars', async ({ page }) => {
    await startMatch(page, { gameSeed: 1 });
    await advance(page, 4);
    // Instrumentation: set hull values directly so the scene is exactly the same on every run.
    await page.evaluate(() => {
      const g = window.__game;
      if (!g) return;
      g.sim.player.health = 20; // wreck stage: two fires, red bar
      const chaser = g.sim.enemies[0];
      if (chaser) chaser.health = chaser.maxHealth * 0.45; // heavy damage: one fire
    });
    await advance(page, 0.05);
    await page.waitForTimeout(600);
    await expect(page.getByTestId('screen-match')).toHaveScreenshot('arena-damaged.png');
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
    // The durable hull was only needed to reach the timer; show a realistic value in the frozen HUD.
    await page.evaluate(() => {
      const g = window.__game;
      if (!g) return;
      g.sim.player.maxHealth = 100;
      g.sim.player.health = 64;
    });
    await expect(page.getByTestId('health')).toHaveText('64 / 100');
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
