import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { applyUrlOverrides } from './scenarios';

/**
 * Starts the mock API in the browser through a service worker, in development AND in the published build
 * (there is no real backend). The worker script is served from /mockServiceWorker.js (public/).
 */
export async function startMocks(): Promise<void> {
  applyUrlOverrides(window.location.search);
  const worker = setupWorker(...handlers);
  await worker.start({
    onUnhandledRequest: 'bypass',
    quiet: true,
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });
}
