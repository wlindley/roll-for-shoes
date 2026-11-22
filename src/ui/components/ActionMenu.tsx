import type React from 'react';
import { useEffect, useId, useRef, useState } from 'react';

export interface ActionMenuItem {
  readonly label: string;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
}

export interface ActionMenuProps {
  readonly label: string;
  readonly items: readonly ActionMenuItem[];
  readonly align?: 'left' | 'right';
  readonly disabled?: boolean;
}

export function ActionMenu(props: ActionMenuProps): React.JSX.Element {
  const { label, items, align = 'left', disabled } = props;
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const initialFocusRef = useRef<'first' | 'last'>('first');
  const menuId = useId();

  const getEnabledItems = (): HTMLButtonElement[] =>
    Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? []);
  const focusEdge = (edge: 'first' | 'last') => {
    const enabled = getEnabledItems();
    (edge === 'last' ? enabled[enabled.length - 1] : enabled[0])?.focus();
  };

  useEffect(() => {
    if (!open) return;
    if (disabled) { setOpen(false); return; }
    focusEdge(initialFocusRef.current);
    initialFocusRef.current = 'first';
    const onPointerDown = (e: PointerEvent) => { if (!anchorRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, disabled]);

  const handleBlur = (event: React.FocusEvent<HTMLDivElement>) => {
    if (event.relatedTarget && !anchorRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
  };

  const handleTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const edge = event.key === 'ArrowUp' ? 'last' : 'first';
      if (open) focusEdge(edge);
      else { initialFocusRef.current = edge; setOpen(true); }
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const enabled = getEnabledItems();
    if (enabled.length === 0) return;
    const i = enabled.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? (i < 0 ? 0 : (i + 1) % enabled.length)
      : event.key === 'ArrowUp' ? (i <= 0 ? enabled.length - 1 : i - 1)
      : event.key === 'End' ? enabled.length - 1 : 0;
    enabled[next]?.focus();
  };

  return (
    <div ref={anchorRef} className="menu-anchor" onBlur={handleBlur}>
      <button ref={triggerRef} type="button" className="btn menu-trigger" aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} disabled={disabled} onClick={() => setOpen((o) => !o)} onKeyDown={handleTriggerKeyDown}><span>{label}</span><span className="menu-caret" aria-hidden="true">▾</span></button>
      {open && (
        <div id={menuId} ref={menuRef} role="menu" aria-label={label} className={align === 'right' ? 'menu-popup menu-popup-right' : 'menu-popup'} onKeyDown={handleMenuKeyDown}>
          {items.map((item) => (
            <button key={item.label} type="button" role="menuitem" className="menu-item" disabled={item.disabled} onClick={() => { setOpen(false); item.onSelect(); }}>{item.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}
