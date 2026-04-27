import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useTimeOfDayPreference } from '@/lib/useTimeOfDayPreference';
import type { TimeOfDayPreference } from '@/lib/timeOfDay';

interface OptionDef {
  value: TimeOfDayPreference;
  label: string;
  Icon: React.ComponentType;
}

const GearIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
    <circle cx="12" cy="12" r="3"/>
  </svg>
);

const WandIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72Z"/>
    <path d="m14 7 3 3"/>
    <path d="M5 6v4"/>
    <path d="M19 14v4"/>
    <path d="M10 2v2"/>
    <path d="M7 8H3"/>
    <path d="M21 16h-4"/>
    <path d="M11 3H9"/>
  </svg>
);

const SunIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="12" cy="12" r="4"/>
    <path d="M12 2v2"/>
    <path d="M12 20v2"/>
    <path d="m4.93 4.93 1.41 1.41"/>
    <path d="m17.66 17.66 1.41 1.41"/>
    <path d="M2 12h2"/>
    <path d="M20 12h2"/>
    <path d="m6.34 17.66-1.41 1.41"/>
    <path d="m19.07 4.93-1.41 1.41"/>
  </svg>
);

const SunsetIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 10V8"/>
    <path d="m4.93 10.93 1.41 1.41"/>
    <path d="M2 18h2"/>
    <path d="M20 18h2"/>
    <path d="m19.07 10.93-1.41 1.41"/>
    <path d="M22 22H2"/>
    <circle cx="12" cy="18" r="4"/>
  </svg>
);

const MoonIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
);

const OPTIONS: ReadonlyArray<OptionDef> = [
  { value: 'auto',    label: 'Auto',    Icon: WandIcon },
  { value: 'daytime', label: 'Daytime', Icon: SunIcon },
  { value: 'dusk',    label: 'Dusk',    Icon: SunsetIcon },
  { value: 'moonlit', label: 'Moonlit', Icon: MoonIcon },
];

/**
 * Floating settings cog at fixed top-right of the viewport.
 * Opens a popover with four time-of-day options.
 *
 * Top-right viewport is reserved for this component — see spec
 * `docs/superpowers/specs/2026-04-26-time-of-day-toggle-design.md`.
 *
 * Note on dev `?mode=` precedence: the URL override wins over both
 * stored preference and auto-derivation. Resolved inside
 * useTimeOfDayPreference. A developer with a stored preference will
 * not see their stored value applied while `?mode=` is set.
 */
export function TimeOfDayCog() {
  const { mode, effectiveMode, setMode } = useTimeOfDayPreference();
  // Track the pathname at which the popover was opened. A route change
  // auto-closes the popover by invalidating the stored path — derived in
  // render without a setState-in-effect (React 19 strict-mode safe).
  const [openedAtPath, setOpenedAtPath] = useState<string | null>(null);
  const location = useLocation();
  // Popover is open only when openedAtPath matches the current path.
  const open = openedAtPath === location.pathname;
  const cogRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Close on Escape; restore focus to cog. Use capture phase + stopImmediatePropagation
  // so this handler runs BEFORE other window-level Escape handlers (e.g., GymPage's
  // exit-focus handler) and prevents them from firing for the same key event. Without
  // this, Esc on a focused route would close the popover AND navigate away.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        setOpenedAtPath(null);
        cogRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  // Close on click outside cog and popover
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (cogRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpenedAtPath(null);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Focus first menuitem on open. useEffect runs post-paint, by which
  // time AnimatePresence has mounted the popover, so the querySelector
  // resolves the rendered DOM directly.
  useEffect(() => {
    if (!open) return;
    const first = popoverRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]');
    first?.focus();
  }, [open]);

  const handleSelect = (value: TimeOfDayPreference) => {
    setMode(value);
    setOpenedAtPath(null);
    cogRef.current?.focus();
  };

  const handlePopoverKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      popoverRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [],
    );
    if (items.length === 0) return;
    const currentIdx = items.findIndex((b) => b === document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(currentIdx + 1) % items.length].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(currentIdx - 1 + items.length) % items.length].focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0].focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1].focus();
    }
  };

  return (
    <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 200 }}>
      <button
        ref={cogRef}
        type="button"
        aria-label="Time of day settings"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpenedAtPath((p) => (p === location.pathname ? null : location.pathname))}
        className="time-of-day-cog-btn"
        style={{
          background: 'transparent',
          border: 'none',
          padding: 10,
          cursor: 'pointer',
          opacity: open ? 1 : 0.85,
          filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.35)) drop-shadow(0 0 1px rgba(255, 255, 255, 0.25))',
          transition: 'opacity 120ms ease-out, filter 120ms ease-out',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <GearIcon />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            ref={popoverRef}
            role="menu"
            aria-label="Time of day"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.12, ease: 'easeOut' }}
            onKeyDown={handlePopoverKeyDown}
            style={{
              position: 'absolute',
              top: 'calc(100% + 8px)',
              right: 0,
              transformOrigin: 'top right',
              minWidth: 188,
              padding: 6,
              background: 'var(--color-paper)',
              border: '1px solid color-mix(in srgb, var(--color-ink) 18%, transparent)',
              borderRadius: 14,
              boxShadow: '0 8px 24px rgba(62, 53, 41, 0.18)',
              color: 'var(--color-ink)',
              fontSize: 13,
            }}
          >
            <div
              style={{
                padding: '8px 12px 4px 12px',
                fontSize: 11,
                opacity: 0.6,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Time of day
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {OPTIONS.map((opt) => {
                const isActive = mode === opt.value;
                const showAutoHint = opt.value === 'auto' && mode === 'auto';
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    onClick={() => handleSelect(opt.value)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 12px',
                      border: 'none',
                      borderRadius: 8,
                      background: isActive ? 'rgba(62, 53, 41, 0.08)' : 'transparent',
                      color: 'var(--color-ink)',
                      cursor: 'pointer',
                      fontWeight: isActive ? 600 : 400,
                      textAlign: 'left',
                    }}
                  >
                    <opt.Icon />
                    <span style={{ flex: 1 }}>{opt.label}</span>
                    {showAutoHint && (
                      <span style={{ fontSize: 11, opacity: 0.55 }}>{effectiveMode}</span>
                    )}
                    {isActive && <span aria-hidden>✓</span>}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
