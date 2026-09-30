import { expect, openMenu, startMatch, test, snapshot } from './support';

test.describe('Options screen', () => {
  test('is reachable from the menu, validates input and shows accessible errors', async ({ page, errors }) => {
    await openMenu(page);
    await page.getByTestId('options').click();
    await expect(page.getByRole('heading', { name: 'Options' })).toBeVisible();

    const session = page.getByLabel('Game session time (seconds)');
    const spawn = page.getByLabel('Enemy spawn time (seconds)');

    await session.fill('30');
    await spawn.fill('0');
    await page.getByTestId('save-options').click();
    await expect(page.getByText('Choose between 60 and 180 seconds.')).toBeVisible();
    await expect(page.getByText('Choose between 0.5 and 10 seconds.')).toBeVisible();
    await expect(session).toHaveAttribute('aria-invalid', 'true');
    await expect(spawn).toHaveAttribute('aria-invalid', 'true');
    // Errors are announced (role=alert regions) and nothing was saved.
    await expect(page.getByRole('alert').filter({ hasText: 'Choose between 60 and 180' })).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem('pirate-battle:options:v1'))).toBeNull();

    // Fixing a field clears its message immediately.
    await session.fill('90');
    await expect(page.getByText('Choose between 60 and 180 seconds.')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('rejects every value just outside the documented limits and accepts the limits themselves', async ({ page }) => {
    await openMenu(page);
    await page.getByTestId('options').click();
    const session = page.getByLabel('Game session time (seconds)');
    const spawn = page.getByLabel('Enemy spawn time (seconds)');
    const save = page.getByTestId('save-options');

    for (const [s, p] of [['59', '3'], ['181', '3'], ['90.5', '3'], ['', '3'], ['90', '0.4'], ['90', '10.1'], ['90', '-2'], ['90', '']] as const) {
      await session.fill(s);
      await spawn.fill(p);
      await save.click();
      await expect(page.getByText('Options saved.')).toBeHidden();
      await expect(page.locator('.field__error:not(:empty)').first()).toBeVisible();
    }
    for (const [s, p] of [['60', '0.5'], ['180', '10']] as const) {
      await session.fill(s);
      await spawn.fill(p);
      await save.click();
      await expect(page.getByText('Options saved.')).toBeVisible();
    }
  });

  test('saved options persist after a refresh and are used as the match snapshot', async ({ page }) => {
    await openMenu(page);
    await page.getByTestId('options').click();
    await page.getByLabel('Game session time (seconds)').fill('75');
    await page.getByLabel('Enemy spawn time (seconds)').fill('2.5');
    await page.getByTestId('save-options').click();
    await expect(page.getByText('Options saved.')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('screen-menu')).toBeVisible(); // a reload always lands on the menu
    await page.getByTestId('options').click();
    await expect(page.getByLabel('Game session time (seconds)')).toHaveValue('75');
    await expect(page.getByLabel('Enemy spawn time (seconds)')).toHaveValue('2.5');

    await page.getByTestId('back').click();
    await page.getByTestId('play').click();
    await page.waitForFunction(() => window.__game !== undefined);
    const s = await snapshot(page);
    expect(s.duration).toBe(75);
    expect(await page.evaluate(() => window.__game?.sim.config.spawn.interval)).toBe(2.5);
  });

  test('Defaults restores the original values, and a match keeps the snapshot it started with', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 100, spawnInterval: 4 } });
    expect((await snapshot(page)).duration).toBe(100);

    // Changing options later only affects the NEXT match.
    await page.keyboard.press('Escape');
    await page.getByTestId('quit').click();
    await page.getByTestId('options').click();
    await page.getByTestId('reset-options').click();
    await expect(page.getByLabel('Game session time (seconds)')).toHaveValue('120');
    await expect(page.getByLabel('Enemy spawn time (seconds)')).toHaveValue('3');
    await page.getByTestId('save-options').click();
    await page.getByTestId('back').click();
    await page.getByTestId('play').click();
    await page.waitForFunction(() => window.__game !== undefined);
    expect((await snapshot(page)).duration).toBe(120);
  });

  test('is fully keyboard operable', async ({ page }) => {
    await openMenu(page);
    await page.getByTestId('options').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('screen-options')).toBeVisible();
    // Focus lands on the screen heading, then Tab reaches the first field.
    await expect(page.getByRole('heading', { name: 'Options' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Game session time (seconds)')).toBeFocused();
  });
});
