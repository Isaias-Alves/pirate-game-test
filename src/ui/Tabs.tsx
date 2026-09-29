import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export interface TabDef {
  id: string;
  label: string;
  panel: ReactNode;
}

/** WAI-ARIA tabs: roving tabindex, Arrow/Home/End keys, only the active panel is rendered. */
export function Tabs({ tabs, label, onChange }: { tabs: TabDef[]; label: string; onChange?: (id: string) => void }) {
  const [active, setActive] = useState(tabs[0]?.id ?? '');
  const base = useId();
  const refs = useRef(new Map<string, HTMLButtonElement>());

  const select = (id: string, focus: boolean) => {
    setActive(id);
    onChange?.(id);
    if (focus) refs.current.get(id)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((t) => t.id === active);
    let next: number;
    if (e.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    const target = tabs[next];
    if (target) select(target.id, true);
  };

  const current = tabs.find((t) => t.id === active);
  return (
    <div className="tabs">
      <div className="tabs__list" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              if (el) refs.current.set(t.id, el);
              else refs.current.delete(t.id);
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${t.id}`}
            aria-selected={t.id === active}
            aria-controls={`${base}-panel-${t.id}`}
            tabIndex={t.id === active ? 0 : -1}
            className="tabs__tab"
            data-testid={`tab-${t.id}`}
            onClick={() => {
              select(t.id, false);
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      {current && (
        <div role="tabpanel" id={`${base}-panel-${current.id}`} aria-labelledby={`${base}-tab-${current.id}`} className="tabs__panel" tabIndex={0}>
          {current.panel}
        </div>
      )}
    </div>
  );
}
