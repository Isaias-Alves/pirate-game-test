import { expect, openMenu, phase, test } from './support';

// The mock service worker is not needed here, and blocking it lets page.route() see every asset request.
test.use({ serviceWorkers: 'block' });

test.describe('Asset loading', () => {
  test('shows progress while loading and starts the match when everything is ready', async ({ page }) => {
    // Hold one file back so the loading state stays on screen long enough to observe.
    await page.route('**/assets/ship_1-*.png', async (route) => {
      await new Promise((r) => setTimeout(r, 3500));
      await route.continue();
    });
    await openMenu(page);
    await page.getByTestId('play').click();

    const loading = page.getByTestId('loading');
    await expect(loading).toBeVisible();
    const bar = loading.getByRole('progressbar', { name: 'Loading game assets' });
    await expect(bar).toBeVisible();
    // Progress is reported: most files are in while the slow one is still pending, so the bar is partly full.
    const value = () => bar.evaluate((el) => (el as HTMLProgressElement).value);
    await expect.poll(value).toBeGreaterThan(0.5);
    expect(await value()).toBeLessThan(1);
    await expect(loading.getByText(/\d+%/)).toBeVisible();

    await expect(loading).toBeHidden({ timeout: 10_000 });
    await expect.poll(() => phase(page)).toBe('playing');
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  test('a failed load blocks combat with an accessible error, and Retry recovers', async ({ page }) => {
    let failing = true;
    await page.route('**/assets/ship_*.png', async (route) => {
      if (failing) await route.abort('failed');
      else await route.continue();
    });
    await openMenu(page);
    await page.getByTestId('play').click();

    const error = page.getByTestId('load-error');
    await expect(error).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: 'Could not load game assets' })).toBeVisible();
    // Combat never started.
    expect(await phase(page)).toBe('none');

    // Retrying while still failing keeps the error.
    await page.getByTestId('retry').click();
    await expect(error).toBeVisible();
    expect(await phase(page)).toBe('none');

    failing = false;
    await page.getByTestId('retry').click();
    await expect(error).toBeHidden();
    await expect.poll(() => phase(page)).toBe('playing');
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  test('the error screen offers a way back to the menu', async ({ page }) => {
    await page.route('**/assets/tile_73*.png', (route) => route.abort('failed'));
    await openMenu(page);
    await page.getByTestId('play').click();
    await expect(page.getByTestId('load-error')).toBeVisible();
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByTestId('screen-menu')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });
});
