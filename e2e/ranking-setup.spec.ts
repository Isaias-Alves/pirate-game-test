import { expect, idleUntilEnd, openMenu, seedOptions, startMatch, test } from './support';

test.describe('Ranking setup picker', () => {
  test('defaults to the player setup and switches to another setup, restarting at page 1', async ({ page, errors }) => {
    await seedOptions(page, { sessionSeconds: 120, spawnInterval: 3 });
    await openMenu(page, { scenario: 'paginated' });
    const picker = page.getByLabel('Setup');
    await expect(picker.locator('option:checked')).toHaveText(/^Your setup \(120 s · enemy every 3 s\)$/);
    await expect(page.getByTestId('ranking-note')).toContainText('120 s · enemy every 3 s');
    await expect(page.getByTestId('page-label')).toHaveText('Page 1 of 10');

    await page.getByTestId('next-page').click();
    await expect(page.getByTestId('page-label')).toHaveText('Page 2 of 10');

    await picker.selectOption({ label: 'Swarm (120 s · enemy every 1.5 s)' });
    await expect(page.getByTestId('ranking-note')).toContainText('120 s · enemy every 1.5 s');
    await expect(page.getByTestId('page-label')).toHaveText(/^Page 1 of \d+$/);
    await expect(page.getByTestId('ranking-row').first()).toBeVisible();
    // Only matches with the chosen setup are listed (fixtures carry their setup; the table does not mix them).
    const ranks = (await page.getByTestId('ranking-row').locator('td:first-child').allTextContents()).map(Number);
    expect(ranks[0]).toBe(1);
    expect(errors).toEqual([]);
  });

  test('a custom setup is listed first and the presets stay available', async ({ page }) => {
    await seedOptions(page, { sessionSeconds: 75, spawnInterval: 2.5 });
    await openMenu(page);
    const options = await page.getByLabel('Setup').locator('option').allTextContents();
    expect(options[0]).toBe('Your setup (75 s · enemy every 2.5 s)');
    expect(options).toContain('Standard (120 s · enemy every 3 s)');
    expect(options).toHaveLength(6);
  });

  test("the player's recorded match appears under its own setup only", async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 60, spawnInterval: 3 }, gameSeed: 1 });
    await idleUntilEnd(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'confirmed');
    await page.getByTestId('main-menu').click();

    // Player setup = Quick (60 s · 3 s): 18 fixture matches + the new one.
    await expect(page.getByTestId('board-count')).toContainText('19 matches');
    await page.getByLabel('Setup').selectOption({ label: 'Standard (120 s · enemy every 3 s)' });
    await expect(page.getByTestId('board-count')).toContainText('34 matches'); // untouched: different setup
  });

  test('the picker is keyboard operable', async ({ page }) => {
    await openMenu(page);
    const picker = page.getByLabel('Setup');
    await picker.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('ranking-note')).not.toContainText('120 s · enemy every 3 s');
  });
});
