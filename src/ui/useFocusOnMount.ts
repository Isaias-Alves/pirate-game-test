import { useEffect, useRef } from 'react';

/** Moves focus to a screen's heading when the screen appears, so keyboard/screen-reader users land at its top. */
export function useFocusOnMount<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return ref;
}
