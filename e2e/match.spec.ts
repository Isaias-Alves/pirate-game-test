import { advance, expect, hold, idleUntilEnd, makeDurable, openMenu, snapshot, startMatch, test } from './support';

const SHORT = { sessionSeconds: 60, spawnInterval: 10 } as const;

test.describe('Match end and restart', () => {
  test('ends by time at exactly the configured duration and freezes the simulation', async ({ page, errors }) => {
    await startMatch(page, { options: SHORT });
    await makeDurable(page); // instrumentation: lets the timer, not the enemies, end the match
    await advance(page, 59);
    expect((await snapshot(page)).phase).toBe('playing');
    await expect(page.getByTestId('time')).toHaveText('0:01');
    await advance(page, 2);

    const end = await snapshot(page);
    expect(end.phase).toBe('ended');
    expect(end.time).toBe(60);
    await expect(page.getByRole('dialog', { name: "Time's up!" })).toBeVisible();
    await expect(page.getByTestId('result-reason')).toHaveText('Time ran out');
    await expect(page.getByTestId('result-time')).toHaveText('1:00');

    // Nothing moves, shoots, spawns or scores any more, whatever the player presses.
    await page.keyboard.down('KeyW');
    await page.keyboard.down('KeyQ');
    await advance(page, 5);
    await page.keyboard.up('KeyQ');
    await page.keyboard.up('KeyW');
    const later = await snapshot(page);
    expect(later.player).toEqual(end.player);
    expect(later.enemies).toEqual(end.enemies);
    expect(later.projectiles).toEqual(end.projectiles);
    expect(later.score).toBe(end.score);
    expect(later.time).toBe(60);
    expect(errors).toEqual([]);
  });

  test('ends by death when the ship is sunk, and stops everything', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 120, spawnInterval: 3 }, gameSeed: 1 });
    const end = await idleUntilEnd(page);
    expect(end.phase).toBe('ended');
    expect(end.player.health).toBe(0);
    expect(end.time).toBeLessThan(120);

    await expect(page.getByRole('dialog', { name: 'Ship sunk!' })).toBeVisible();
    await expect(page.getByTestId('result-reason')).toHaveText('Ship sunk');
    await expect(page.getByTestId('result-score')).toHaveText(String(end.score));

    await advance(page, 10);
    const later = await snapshot(page);
    expect(later.time).toBe(end.time);
    expect(later.enemies).toEqual(end.enemies);
    expect(later.player.health).toBe(0);
  });

  test('Play Again starts a clean match: life, score, timer and entities restored', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 90, spawnInterval: 3 }, gameSeed: 1 });
    await hold(page, ['KeyW', 'Space'], 2);
    const end = await idleUntilEnd(page);
    expect(end.time).toBeGreaterThan(0);

    await page.getByTestId('play-again').click();
    await expect(page.getByRole('dialog')).toBeHidden();
    const fresh = await snapshot(page);
    expect(fresh.phase).toBe('playing');
    expect(fresh.time).toBe(0);
    expect(fresh.score).toBe(0);
    expect(fresh.player.health).toBe(fresh.player.maxHealth);
    expect(fresh.player.maxHealth).toBe(100);
    expect(fresh.enemies).toHaveLength(0);
    expect(fresh.projectiles).toHaveLength(0);
    expect(fresh.duration).toBe(90);
    await expect(page.getByTestId('time')).toHaveText('1:30');
    await expect(page.getByTestId('score')).toHaveText('0');
    await expect(page.locator('canvas')).toHaveCount(1);

    // And it really is playable again.
    await hold(page, ['KeyW'], 0.5);
    expect((await snapshot(page)).player.y).toBeLessThan(fresh.player.y);
  });

  test('the result survives a refresh as the last match on the menu', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 120, spawnInterval: 3 }, gameSeed: 1 });
    const end = await idleUntilEnd(page);
    const score = await page.getByTestId('result-score').textContent();
    const time = await page.getByTestId('result-time').textContent();
    expect(score).toBe(String(end.score));

    await page.reload();
    await expect(page.getByTestId('screen-menu')).toBeVisible();
    const last = page.getByTestId('last-match');
    await expect(last).toBeVisible();
    await expect(page.getByTestId('last-match-score')).toHaveText(score ?? '');
    await expect(last).toContainText('Ship sunk');
    await expect(last).toContainText(`${time ?? ''} played`);
  });

  test('the result dialog traps focus and Main Menu returns to the menu', async ({ page }) => {
    await startMatch(page, { options: SHORT, gameSeed: 1 });
    await idleUntilEnd(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('play-again')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByTestId('main-menu')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(dialog.getByTestId('play-again')).toBeFocused();
    await dialog.getByTestId('main-menu').click();
    await expect(page.getByTestId('screen-menu')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(0);
  });

  test('a fire key still held when the match ends does not dismiss the result by accident', async ({ page }) => {
    await startMatch(page, { options: SHORT, gameSeed: 1 });
    await page.keyboard.down('Space'); // firing when the ship goes down
    await idleUntilEnd(page);
    await expect(page.getByRole('dialog', { name: 'Ship sunk!' })).toBeVisible();
    await page.keyboard.up('Space'); // releasing it "clicks" the focused button: must be ignored
    await expect(page.getByRole('dialog', { name: 'Ship sunk!' })).toBeVisible();
    expect((await snapshot(page)).phase).toBe('ended');
  });

  test('keys are only captured during gameplay', async ({ page }) => {
    await openMenu(page);
    const spaceWasPrevented = () =>
      page.evaluate(() => {
        const e = new KeyboardEvent('keydown', { code: 'Space', cancelable: true, bubbles: true });
        window.dispatchEvent(e);
        return e.defaultPrevented;
      });
    expect(await spaceWasPrevented()).toBe(false);

    await page.getByTestId('play').click();
    await page.waitForFunction(() => window.__game !== undefined);
    expect(await spaceWasPrevented()).toBe(true);

    await page.keyboard.press('Escape');
    await page.getByTestId('quit').click();
    await expect(page.getByTestId('screen-menu')).toBeVisible();
    expect(await spaceWasPrevented()).toBe(false);
  });
});
