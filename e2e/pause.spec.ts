import { expect, snapshot, startMatch, test } from './support';

// Pause behaviour depends on the real clock, so these tests run the normal ticker.
const REAL = { clock: 'real', options: { sessionSeconds: 180, spawnInterval: 10 } } as const;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test.describe('Pause', () => {
  test('Escape pauses: time, cooldowns and simulation stop until an explicit resume', async ({ page }) => {
    await startMatch(page, REAL);
    await wait(400);
    await page.keyboard.press('Escape');
    const dialog = page.getByRole('dialog', { name: 'Paused' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('resume')).toBeFocused();

    const frozen = await snapshot(page);
    await wait(900);
    const still = await snapshot(page);
    expect(still.time).toBe(frozen.time);
    expect(still.player).toEqual(frozen.player);

    // It does not resume by itself, and resuming needs an action.
    await expect(dialog).toBeVisible();
    const clickedAt = Date.now();
    await dialog.getByTestId('resume').click();
    await expect(dialog).toBeHidden();
    const resumedAt = (await snapshot(page)).time;
    await wait(400);
    const after = await snapshot(page);
    expect(after.time).toBeGreaterThan(resumedAt);
    // Game time advanced by no more than the real time since resuming: the paused seconds were not added.
    const realSinceResume = (Date.now() - clickedAt) / 1000;
    expect(after.time - frozen.time).toBeLessThan(realSinceResume + 0.2);
  });

  test('the pause key toggles, and the HUD button works too', async ({ page }) => {
    await startMatch(page, REAL);
    await page.keyboard.press('KeyP');
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    await page.keyboard.press('KeyP');
    await expect(page.getByRole('dialog')).toBeHidden();
    await page.getByRole('button', { name: 'Pause game' }).click();
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  });

  test('losing window focus pauses automatically and explains why', async ({ page }) => {
    await startMatch(page, REAL);
    await wait(300);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const dialog = page.getByRole('dialog', { name: 'Paused' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('lost focus');
    const t = (await snapshot(page)).time;
    await wait(700);
    expect((await snapshot(page)).time).toBe(t);
    // Focus coming back does not resume on its own.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(dialog).toBeVisible();
  });

  test('hiding the tab pauses automatically', async ({ page }) => {
    await startMatch(page, REAL);
    await page.evaluate(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    await expect(page.getByTestId('resume')).toBeVisible();
  });

  test('nothing held or pressed during a pause is carried into the resumed match', async ({ page }) => {
    await startMatch(page, REAL);
    await page.keyboard.down('KeyW');
    await wait(200);
    await page.keyboard.press('Escape'); // paused with W still held
    await page.keyboard.down('KeyQ'); // pressed while paused: ignored
    await wait(400);
    await page.keyboard.up('KeyQ');
    await page.keyboard.up('KeyW');
    await page.keyboard.press('Escape'); // resume
    await expect(page.getByRole('dialog')).toBeHidden();

    const before = await snapshot(page);
    expect(before.input.forward).toBe(false);
    expect(before.input.fireLeft).toBe(false);
    expect(before.projectiles).toHaveLength(0);
    await wait(500);
    const after = await snapshot(page);
    // The key held into the pause is not re-applied: the ship only coasts (speed keeps falling) and nothing fires.
    expect(after.input.forward).toBe(false);
    expect(after.player.speed).toBeLessThan(before.player.speed);
    expect(after.projectiles).toHaveLength(0);
  });

  test('Restart from the pause menu creates a fresh match', async ({ page }) => {
    await startMatch(page, REAL);
    await page.keyboard.down('KeyW');
    await wait(500);
    await page.keyboard.up('KeyW');
    await page.keyboard.press('Escape');
    const clickedAt = Date.now();
    await page.getByTestId('restart').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    const s = await snapshot(page);
    expect(s.time).toBeLessThan((Date.now() - clickedAt) / 1000 + 0.2); // a new clock, not the old 0.5 s
    expect(s.player.y).toBeCloseTo(620, 0);
    expect(s.player.health).toBe(s.player.maxHealth);
  });

  test('the pause dialog carries a keyboard-reachable controls reminder', async ({ page }) => {
    await startMatch(page, REAL);
    // The arena has an accessible name even though the canvas itself is not readable.
    await expect(page.getByRole('img', { name: 'Battle arena' })).toBeVisible();
    await page.keyboard.press('Escape');
    const dialog = page.getByRole('dialog', { name: 'Paused' });
    const reminder = dialog.getByTestId('pause-controls');
    await expect(reminder).not.toHaveAttribute('open'); // collapsed, so the dialog stays short
    // Tab order stays inside the dialog and reaches the reminder.
    const summary = reminder.locator('summary');
    for (let i = 0; i < 4 && !(await summary.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(reminder).toHaveAttribute('open');
    await expect(reminder).toContainText('Fire left broadside');
    await expect(reminder.locator('kbd', { hasText: 'Q' })).toBeVisible();
    // Still paused: reading the reminder does not resume the match.
    await expect(dialog).toBeVisible();
  });
});
