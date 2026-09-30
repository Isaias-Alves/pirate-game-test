import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, idleUntilEnd, openMenu, startMatch, test } from './support';

const WCAG_AA = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** Automated WCAG 2.1 A/AA scan (names, labels, ARIA, roles, contrast where axe can compute it). */
async function violations(page: Page): Promise<string[]> {
  const { violations: found } = await new AxeBuilder({ page }).withTags(WCAG_AA).analyze();
  return found.map((v) => `${v.id} (${v.impact ?? 'n/a'}): ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
}

/**
 * axe cannot compute contrast over background images or gradients, and every panel and button here is sprite art.
 * For each text element axe left undetermined, hide the text, screenshot what is behind it, and compare the text
 * colour with the median background pixel (WCAG formula; 3:1 for large text, 4.5:1 otherwise).
 */
async function contrastFailures(page: Page): Promise<string[]> {
  const { incomplete } = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  const selectors = incomplete.flatMap((r) => r.nodes.map((n) => n.target[0])).filter((s): s is string => typeof s === 'string');
  await page.addStyleTag({ content: '.a11y-probe, .a11y-probe * { color: transparent !important; text-shadow: none !important; }' });
  const failures: string[] = [];
  for (const selector of selectors) {
    const el = page.locator(selector).first();
    if (!(await el.isVisible())) continue;
    const text = await el.evaluate((node) => {
      // getComputedStyle is live: read the values before the probe class hides the text.
      const cs = getComputedStyle(node);
      const read = { color: cs.color, size: parseFloat(cs.fontSize), bold: Number(cs.fontWeight) >= 700 };
      node.classList.add('a11y-probe');
      return read;
    });
    const shot = await el.screenshot({ animations: 'disabled' });
    await el.evaluate((node) => {
      node.classList.remove('a11y-probe');
    });
    const ratio = await page.evaluate(
      async ({ png, color }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${png}`;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return 0;
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, img.width, img.height).data;
        const channel = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
        const lum = (r: number, g: number, b: number) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        const bg: { l: number; rgb: [number, number, number] }[] = [];
        for (let i = 0; i < px.length; i += 4) bg.push({ l: lum(px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0), rgb: [px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0] });
        bg.sort((a, b) => a.l - b.l);
        const median = bg[Math.floor(bg.length / 2)];
        if (!median) return 0;
        // Semi-transparent text is blended over the background first.
        const [r = 0, g = 0, b = 0, a = 1] = (color.match(/[\d.]+/g) ?? []).map(Number);
        const mix = (fg: number, back: number) => fg * a + back * (1 - a);
        const t = lum(mix(r, median.rgb[0]), mix(g, median.rgb[1]), mix(b, median.rgb[2]));
        return (Math.max(t, median.l) + 0.05) / (Math.min(t, median.l) + 0.05);
      },
      { png: shot.toString('base64'), color: text.color },
    );
    const needed = text.size >= 24 || (text.size >= 18.66 && text.bold) ? 3 : 4.5;
    if (ratio < needed) failures.push(`${selector}: ${ratio.toFixed(2)}:1 (needs ${String(needed)}:1)`);
  }
  return failures;
}

async function expectAccessible(page: Page): Promise<void> {
  expect(await violations(page)).toEqual([]);
  expect(await contrastFailures(page)).toEqual([]);
}

test.describe('Accessibility scan (axe WCAG 2.1 AA + measured contrast)', () => {
  test('main menu: ranking and match history tabs', async ({ page }) => {
    await openMenu(page);
    await expect(page.getByTestId('board-count')).toBeVisible();
    await expectAccessible(page);
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('board-empty')).toBeVisible();
    await expectAccessible(page);
  });

  test('options, including the validation errors', async ({ page }) => {
    await openMenu(page);
    await page.getByTestId('options').click();
    await page.getByLabel('Game session time (seconds)').fill('30');
    await page.getByTestId('save-options').click();
    await expect(page.getByText('Choose between 60 and 180 seconds.')).toBeVisible();
    await expectAccessible(page);
  });

  test('match: HUD and the pause dialog', async ({ page }) => {
    await startMatch(page, { gameSeed: 1 });
    await expectAccessible(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    await expectAccessible(page);
  });

  test('result dialog', async ({ page }) => {
    await startMatch(page, { options: { sessionSeconds: 60, spawnInterval: 3 }, gameSeed: 1 });
    await idleUntilEnd(page);
    await expect(page.getByTestId('record-status')).toHaveAttribute('data-state', 'confirmed');
    await expectAccessible(page);
  });
});
