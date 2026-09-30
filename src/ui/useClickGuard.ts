import { useCallback, useEffect, useRef, type MouseEvent } from 'react';

/**
 * Stops a keyboard "click" that was really aimed at the game. When a dialog opens under a held fire key
 * (Space), releasing that key would press the focused button and dismiss the dialog by accident. For a short
 * window after mount, clicks that come from the keyboard (`detail === 0`) are ignored; mouse and touch clicks
 * always work.
 */
export function useClickGuard(ms = 600) {
  const openedAt = useRef(Number.POSITIVE_INFINITY);
  useEffect(() => {
    openedAt.current = performance.now();
  }, []);
  return useCallback(
    (handler: () => void) => (e: MouseEvent) => {
      if (e.detail === 0 && performance.now() - openedAt.current < ms) return;
      handler();
    },
    [ms],
  );
}
