import { useEffect } from 'react';

/**
 * Fixed background behind all content. Reads `--world-bg` (set by
 * `body[data-mode]` via the useTimeOfDay hook) and stays at `-z-10`
 * so content cards float above it. Also wires the `tab-hidden` body
 * class so scoped particle animations (raindrops, lamp flicker) can
 * pause when the tab is in the background — spec §4.5 / §5.2.
 *
 * Phase 1 is intentionally sparse: no window, no lamp, no room swap.
 * Those arrive in Phase 3 (RoomSection) and Phase 4 (WindowPane).
 */
export function WorldLayer() {
  useEffect(() => {
    const onVisibility = () => {
      document.body.classList.toggle('tab-hidden', document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 pointer-events-none transition-colors duration-300"
      style={{ backgroundColor: 'var(--world-bg)' }}
    />
  );
}
