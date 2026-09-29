/** Rendering above 2x costs a lot of fill rate for little visible gain on phones. */
export const MAX_RESOLUTION = 2;

export const currentResolution = (): number => Math.min(window.devicePixelRatio, MAX_RESOLUTION);

/**
 * Calls `onChange` whenever devicePixelRatio changes (browser zoom, moving the window between monitors).
 * The media query is tied to the current ratio, so it must be re-armed after every change.
 * Returns a function that stops watching.
 */
export function watchPixelRatio(onChange: () => void): () => void {
  let query: MediaQueryList | undefined;
  let stopped = false;

  const arm = () => {
    query = window.matchMedia(`(resolution: ${String(window.devicePixelRatio)}dppx)`);
    query.addEventListener('change', handle, { once: true });
  };
  function handle() {
    if (stopped) return;
    onChange();
    arm();
  }
  arm();

  return () => {
    stopped = true;
    query?.removeEventListener('change', handle);
  };
}
