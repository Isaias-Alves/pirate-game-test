import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Unit tests live next to the code; Playwright specs in e2e/ are run by Playwright, not Vitest.
  test: { include: ['src/**/*.test.ts'] },
});
