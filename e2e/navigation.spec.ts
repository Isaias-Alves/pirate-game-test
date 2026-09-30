import { advance, expect, openMenu, snapshot, startMatch, test } from './support';

test.describe('Navigation and abandoning a match', () => {
  test('leaving a match from the pause menu abandons it: nothing is recorded or remembered', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 60, spawnInterval: 10 } });
    await advance(page, 5);
    await page.keyboard.press('Escape');
    await page.getByTestId('quit').click();
    await expect(page.getByTestId('screen-menu')).toBeVisible();

    await expect(page.getByTestId('last-match')).toHaveCount(0);
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('board-empty')).toBeVisible();
    await expect(page.getByTestId('pending-banner')).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem('pirate-battle:mock-db:v1'))).toBeNull();
    expect(await page.evaluate(() => window.localStorage.getItem('pirate-battle:last-result:v1'))).toBeNull();
    expect(await page.evaluate(() => window.__game)).toBeUndefined();
  });

  test('reloading in the middle of a match ends it and lands on the menu, unrecorded', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 60, spawnInterval: 10 } });
    await advance(page, 5);
    await page.reload();
    await expect(page.getByTestId('screen-menu')).toBeVisible();
    await expect(page.getByTestId('screen-match')).toHaveCount(0);
    await expect(page.getByTestId('last-match')).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem('pirate-battle:mock-db:v1'))).toBeNull();
  });

  test('going back and forth between screens repeatedly leaves no canvas, errors or leaks behind', async ({ page, errors }) => {
    await openMenu(page);
    for (let i = 0; i < 4; i++) {
      await page.getByTestId('options').click();
      await expect(page.getByTestId('screen-options')).toBeVisible();
      await page.getByTestId('back').click();

      await page.getByTestId('play').click();
      await page.waitForFunction(() => window.__game !== undefined);
      await expect(page.locator('canvas')).toHaveCount(1);
      await advance(page, 1);
      await page.keyboard.press('Escape');
      await page.getByTestId('quit').click();
      await expect(page.getByTestId('screen-menu')).toBeVisible();
      await expect(page.locator('canvas')).toHaveCount(0);
      expect(await page.evaluate(() => window.__game)).toBeUndefined();
    }
    expect(errors).toEqual([]);
  });

  test('the menu shows the controls and both leaderboard tabs, and the tabs work from the keyboard', async ({ page }) => {
    await openMenu(page);
    for (const key of ['W', 'A', 'D', 'Space', 'Q', 'E']) await expect(page.locator('kbd', { hasText: key }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Controls' })).toBeVisible();

    const ranking = page.getByRole('tab', { name: 'Ranking' });
    const history = page.getByRole('tab', { name: 'Match History' });
    await expect(ranking).toHaveAttribute('aria-selected', 'true');
    await ranking.focus();
    await page.keyboard.press('ArrowRight');
    await expect(history).toBeFocused();
    await expect(history).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toBeVisible();
    await page.keyboard.press('Home');
    await expect(ranking).toHaveAttribute('aria-selected', 'true');
  });

  test('the screen-reader status region reports score, time and state without per-frame announcements', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 60, spawnInterval: 10 } });
    const region = page.getByRole('region', { name: 'Match status' });
    await expect(region).toContainText('Status: In progress');
    await expect(region).toContainText('Score: 0');
    await expect(region).toContainText('Time left: 60 seconds');
    await advance(page, 20);
    await expect(region).toContainText('Time left: 40 seconds');
    // Only one polite live region exists; score/time are plain text.
    await expect(region.locator('[aria-live]')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(region.getByRole('status')).toHaveText('Game paused.');
  });
});

test.describe('Touch controls', () => {
  const projectIsMobile = () => test.info().project.name.includes('mobile');

  test('are present on touch devices, hidden on desktop, and labelled', async ({ page }) => {
    await startMatch(page);
    const group = page.getByRole('group', { name: 'Touch controls' });
    if (projectIsMobile()) {
      await expect(group).toBeVisible();
      for (const name of ['Turn left', 'Turn right', 'Sail forward', 'Fire front', 'Fire left side', 'Fire right side']) {
        await expect(group.getByRole('button', { name })).toBeVisible();
      }
    } else {
      await expect(group).toHaveCount(0);
    }
  });

  test('hold several buttons at once to sail, turn and fire together', async ({ page }) => {
    await startMatch(page, { touch: true, options: { sessionSeconds: 180, spawnInterval: 10 } });
    const btn = (id: string) => page.getByTestId(`touch-${id}`);
    await expect(btn('forward')).toBeVisible();
    const before = await snapshot(page);

    // Three fingers: forward + turn right + front cannon.
    await btn('forward').dispatchEvent('pointerdown', { pointerId: 11, pointerType: 'touch', isPrimary: true, bubbles: true });
    await btn('turnRight').dispatchEvent('pointerdown', { pointerId: 12, pointerType: 'touch', bubbles: true });
    await btn('fireFront').dispatchEvent('pointerdown', { pointerId: 13, pointerType: 'touch', bubbles: true });
    const held = await snapshot(page);
    expect(held.input).toMatchObject({ forward: true, turnRight: true, fireFront: true, turnLeft: false });

    await advance(page, 1);
    const moved = await snapshot(page);
    expect(Math.hypot(moved.player.x - before.player.x, moved.player.y - before.player.y)).toBeGreaterThan(40);
    expect(moved.player.angle).toBeGreaterThan(before.player.angle);
    expect(moved.projectiles.filter((p) => p.owner === 'player').length).toBeGreaterThanOrEqual(2);

    // Lifting one finger releases only that control.
    await btn('turnRight').dispatchEvent('pointerup', { pointerId: 12, pointerType: 'touch', bubbles: true });
    expect((await snapshot(page)).input).toMatchObject({ forward: true, turnRight: false, fireFront: true });
    await btn('forward').dispatchEvent('pointerup', { pointerId: 11, pointerType: 'touch', bubbles: true });
    await btn('fireFront').dispatchEvent('pointerup', { pointerId: 13, pointerType: 'touch', bubbles: true });
    expect((await snapshot(page)).input).toMatchObject({ forward: false, turnRight: false, fireFront: false });
  });

  test('every touch control drives the same action as its key', async ({ page }) => {
    await startMatch(page, { touch: true, options: { sessionSeconds: 180, spawnInterval: 10 } });
    const press = async (id: string, expected: string) => {
      const b = page.getByTestId(`touch-${id}`);
      await b.dispatchEvent('pointerdown', { pointerId: 21, pointerType: 'touch', bubbles: true });
      expect((await snapshot(page)).input[expected]).toBe(true);
      await b.dispatchEvent('pointerup', { pointerId: 21, pointerType: 'touch', bubbles: true });
      expect((await snapshot(page)).input[expected]).toBe(false);
    };
    for (const id of ['forward', 'turnLeft', 'turnRight', 'fireFront', 'fireLeft', 'fireRight']) await press(id, id);
  });

  test('presses are ignored while paused', async ({ page }) => {
    await startMatch(page, { touch: true });
    await page.keyboard.press('Escape');
    await page.getByTestId('touch-forward').dispatchEvent('pointerdown', { pointerId: 31, pointerType: 'touch', bubbles: true });
    expect((await snapshot(page)).input.forward).toBe(false);
  });

  test('the layout fits the screen: no page scrolling and the whole arena and HUD are visible', async ({ page }) => {
    await startMatch(page, { touch: true });
    const fit = await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
      };
      return {
        vw: window.innerWidth,
        vh: window.innerHeight,
        scrollW: document.documentElement.scrollWidth,
        scrollH: document.documentElement.scrollHeight,
        hud: box('.hud'),
        arena: box('.match__arena'),
        canvas: box('canvas'),
      };
    });
    expect(fit.scrollW).toBeLessThanOrEqual(fit.vw);
    expect(fit.scrollH).toBeLessThanOrEqual(fit.vh);
    for (const b of [fit.hud, fit.arena, fit.canvas]) {
      expect(b).not.toBeNull();
      expect(b?.left).toBeGreaterThanOrEqual(-0.5);
      expect(b?.top).toBeGreaterThanOrEqual(-0.5);
      expect(b?.right).toBeLessThanOrEqual(fit.vw + 0.5);
      expect(b?.bottom).toBeLessThanOrEqual(fit.vh + 0.5);
    }
  });
});

test.describe('Dialogs on small screens', () => {
  const fits = async (page: import('@playwright/test').Page, name: string) => {
    const dialog = page.getByRole('dialog', { name });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    const vp = page.viewportSize();
    expect(box).not.toBeNull();
    expect(vp).not.toBeNull();
    expect(box?.y).toBeGreaterThanOrEqual(0);
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual((vp?.height ?? 0) + 0.5);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual((vp?.width ?? 0) + 0.5);
    // Every action inside is reachable without scrolling.
    for (const b of await dialog.getByRole('button').all()) await expect(b).toBeInViewport();
  };

  test('the pause dialog fits the screen', async ({ page }) => {
    await startMatch(page);
    await page.keyboard.press('Escape');
    await fits(page, 'Paused');
  });

  test('the result dialog fits the screen', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 60, spawnInterval: 10 } });
    await page.evaluate(() => {
      const g = window.__game;
      if (g) {
        g.sim.player.maxHealth = 1e9;
        g.sim.player.health = 1e9;
      }
    });
    await advance(page, 61);
    await page.waitForTimeout(300);
    await fits(page, "Time's up!");
  });
});
