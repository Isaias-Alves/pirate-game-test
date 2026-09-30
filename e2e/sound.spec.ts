import type { Page } from '@playwright/test';
import { advance, expect, hold, openMenu, startMatch, test } from './support';

/**
 * Counts one-shot sounds actually started by the page (ambient loops are left out: they start whenever their file
 * finishes decoding, muted or not, through a silent master gain). The spy wraps the browser's
 * AudioBufferSourceNode.start, so it observes real playback without any hook in the application.
 */
async function spyOnAudio(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __soundStarts: number };
    w.__soundStarts = 0;
    const proto = AudioBufferSourceNode.prototype;
    const original = Object.getOwnPropertyDescriptor(proto, 'start')?.value as (this: AudioBufferSourceNode, ...args: number[]) => void;
    proto.start = function (this: AudioBufferSourceNode, ...args: number[]) {
      if (!this.loop) w.__soundStarts += 1;
      original.apply(this, args);
    };
  });
}

const soundStarts = (page: Page) => page.evaluate(() => (window as unknown as { __soundStarts: number }).__soundStarts);

/** Sounds decode in the background; give them a moment before counting. */
const settle = (page: Page) => page.waitForTimeout(700);

const QUIET = { sessionSeconds: 180, spawnInterval: 10 } as const;

test.describe('Sound', () => {
  test('firing, hits and explosions play sounds, without console errors', async ({ page, errors }) => {
    await spyOnAudio(page);
    await startMatch(page, { options: QUIET });
    await settle(page);
    const before = await soundStarts(page);
    await hold(page, ['Space', 'KeyQ', 'KeyE'], 0.1);
    await settle(page);
    await advance(page, 0.05);
    await settle(page);
    expect(await soundStarts(page)).toBeGreaterThan(before);
    expect(errors).toEqual([]);
  });

  test('the HUD button mutes and unmutes, and the choice survives a reload', async ({ page }) => {
    await spyOnAudio(page);
    await startMatch(page, { options: QUIET });
    const mute = page.getByRole('button', { name: 'Mute sound' });
    await expect(mute).toHaveAttribute('aria-pressed', 'false');
    await mute.click();
    await expect(mute).toHaveAttribute('aria-pressed', 'true');

    await settle(page);
    const before = await soundStarts(page);
    await hold(page, ['Space'], 0.1);
    await settle(page);
    expect(await soundStarts(page)).toBe(before); // muted: nothing new plays

    await page.reload();
    await page.getByTestId('play').click();
    await page.waitForFunction(() => window.__game !== undefined);
    await expect(page.getByRole('button', { name: 'Mute sound' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Mute sound' }).click();
    await expect(page.getByRole('button', { name: 'Mute sound' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('M toggles sound during a match only', async ({ page }) => {
    await openMenu(page);
    const onMenu = await page.evaluate(() => {
      const e = new KeyboardEvent('keydown', { code: 'KeyM', cancelable: true, bubbles: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    expect(onMenu).toBe(false);

    await page.getByTestId('play').click();
    await page.waitForFunction(() => window.__game !== undefined);
    const mute = page.getByRole('button', { name: 'Mute sound' });
    await page.keyboard.press('KeyM');
    await expect(mute).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('KeyM');
    await expect(mute).toHaveAttribute('aria-pressed', 'false');
  });

  test('muting works while paused and the match keeps its state', async ({ page }) => {
    await startMatch(page, { options: QUIET });
    await advance(page, 2);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    await page.keyboard.press('KeyM');
    await expect(page.getByRole('button', { name: 'Mute sound' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible(); // still paused
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});
