import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';

const FOCUSABLE = 'button:not(:disabled), summary, [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

interface DialogProps {
  labelledBy: string;
  children: ReactNode;
  /** Element to focus on open. Defaults to the first focusable control. */
  initialFocus?: RefObject<HTMLElement | null>;
  className?: string;
}

/**
 * Modal dialog: role=dialog + aria-modal, focus moves inside on open, Tab/Shift+Tab cycle within it,
 * and focus returns to whatever had it before the dialog opened.
 */
export function Dialog({ labelledBy, children, initialFocus, className }: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const target = initialFocus?.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
    return () => {
      previous?.focus();
    };
  }, [initialFocus]);

  const trap = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !panelRef.current?.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (active === last || !panelRef.current?.contains(active))) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="overlay" role="presentation">
      <div ref={panelRef} className={`overlay__panel panel ${className ?? ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy} onKeyDown={trap}>
        {children}
      </div>
    </div>
  );
}
