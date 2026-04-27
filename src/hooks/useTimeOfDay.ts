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
 * Returns the current world-layer mode (hour-derived). Pure derivation;
 * does NOT write to `body[data-mode]` — that is owned by
 * useTimeOfDayPreference which factors in user preference and dev URL
 * override.
 *
 * Caches in localStorage for up to 60 minutes AND only while the cached
 * hour bucket matches the current hour bucket — without the bucket
 * check, a 4:50pm load would stay 'daytime' until ~5:50pm even though
 * dusk starts at 5pm per hourToMode.
 *
 * Note: cached hours are derived from `Date.getHours()`, which can
 * repeat during DST "fall back" transitions. The result is a stale
 * mode for up to one hour at the rollback boundary, once a year. Same
 * class of minor staleness as the pre-fix bug, but bounded.
 *
 * Purely time-derived; does not read the URL. Dev `?mode=` override
 * is owned by useTimeOfDayPreference via getDevModeOverride.
 */
export function useTimeOfDay(): WorldMode {
  const [mode, setMode] = useState<WorldMode>(() => compute());

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = compute();
      setMode((prev) => (prev === next ? prev : next));
    }, CHECK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return mode;
}

export function getDevModeOverride(
  search: string = (typeof window !== 'undefined' ? window.location.search : ''),
): WorldMode | null {
  if (!import.meta.env.DEV) return null;
  try {
    const param = new URLSearchParams(search).get('mode');
    if (param === 'daytime' || param === 'dusk' || param === 'moonlit') {
      return param;
    }
  } catch {
    /* ignore */
  }
  return null;
}

function compute(): WorldMode {
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
