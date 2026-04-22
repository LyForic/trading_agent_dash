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
 */
export function useTimeOfDay(): WorldMode {
  const [mode, setMode] = useState<WorldMode>(() => compute());

  useEffect(() => {
    document.body.dataset.mode = mode;
  }, [mode]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = compute();
      setMode((prev) => (prev === next ? prev : next));
    }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return mode;
}

function compute(): WorldMode {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(CACHE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as CacheEntry;
        if (Date.now() - parsed.computedAt < CACHE_TTL_MS) {
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
