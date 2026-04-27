import { useEffect, useState } from 'react';
import { hourToMode, type WorldMode } from '@/lib/timeOfDay';

const CACHE_KEY = 'gym_world_mode';
const CACHE_TTL_MS = 60 * 60 * 1000; // 60 min
const CHECK_INTERVAL_MS = 60 * 1000; // re-check every minute for hour crossings

interface CacheEntry {
  mode: WorldMode;
  computedAt: number;
}

/**
 * Returns the current world-layer mode and applies it to `<body data-mode="...">`
 * as a side effect so the CSS variable overrides in globals.css take effect.
 * Caches in localStorage for 60 minutes so the same client doesn't recompute
 * on every page load inside the same hour.
 *
 * Dev-only: `?mode=daytime|dusk|moonlit` pins the mode for QA. Stripped from
 * production builds via the `import.meta.env.DEV` guard.
 */
export function useTimeOfDay(): WorldMode {
  const [mode, setMode] = useState<WorldMode>(() => compute());

  useEffect(() => {
    document.body.dataset.mode = mode;
  }, [mode]);

  useEffect(() => {
    // Skip the hourly recompute when a dev override is active so the interval
    // doesn't fight the pinned mode.
    if (getDevModeOverride() !== null) return;
    const id = window.setInterval(() => {
      const next = compute();
      setMode((prev) => (prev === next ? prev : next));
    }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return mode;
}

export function getDevModeOverride(): WorldMode | null {
  if (!import.meta.env.DEV) return null;
  if (typeof window === 'undefined') return null;
  try {
    const param = new URLSearchParams(window.location.search).get('mode');
    if (param === 'daytime' || param === 'dusk' || param === 'moonlit') {
      return param;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function compute(): WorldMode {
  const override = getDevModeOverride();
  if (override !== null) return override;

  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CacheEntry;
        const cachedHour = new Date(parsed.computedAt).getHours();
        const currentHour = new Date().getHours();
        if (
          Date.now() - parsed.computedAt < CACHE_TTL_MS &&
          cachedHour === currentHour
        ) {
          return parsed.mode;
        }
      }
    } catch {
      /* ignore */
    }
  }
  const mode = hourToMode(new Date().getHours());
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ mode, computedAt: Date.now() } satisfies CacheEntry),
      );
    } catch {
      /* ignore */
    }
  }
  return mode;
}
