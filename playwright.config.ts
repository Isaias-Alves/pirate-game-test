import { defineConfig, devices } from '@playwright/test';

const PORT = 4174;

/**
 * End-to-end + visual regression. Tests run against an optimized build made with `--mode e2e`
 * (test hooks on, short network timeouts), served by `vite preview` — the same kind of artifact that is deployed.
 */
export default defineConfig({
  testDir: './e2e',
  snapshotPathTemplate: '{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // The arena renders with software WebGL in headless Chromium, so extra workers only slow each other down.
  workers: 2,
  timeout: 45_000,
  expect: {
    timeout: 8_000,
    // Tight on purpose: a changed HUD value or bar colour must fail. Rendering is deterministic (seeded sim, manual clock,
    // reduced motion), so the budget only absorbs anti-aliasing noise.
    toHaveScreenshot: { maxDiffPixels: 60, animations: 'disabled' },
  },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://localhost:${String(PORT)}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
    locale: 'en-US',
    timezoneId: 'UTC',
  },
  projects: [
    { name: 'chromium-desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } } },
    { name: 'chromium-mobile', use: { ...devices['Pixel 7 landscape'] } },
  ],
  webServer: {
    // `npm run test:e2e` builds first; the server only serves dist-e2e, so a reused server never serves a stale build.
    command: 'npm run preview:e2e',
    url: `http://localhost:${String(PORT)}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
