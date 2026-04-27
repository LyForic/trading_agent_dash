import { useState } from 'react';
import { getDevModeOverride, useTimeOfDay } from '@/hooks/useTimeOfDay';
import type { TimeOfDayPreference, WorldMode } from '@/lib/timeOfDay';

const STORAGE_KEY = 'gym:settings:time-mode';
const VALID_PREFERENCES: ReadonlyArray<TimeOfDayPreference> = [
  'auto',
  'daytime',
  'dusk',
  'moonlit',
];

interface Result {
  mode: TimeOfDayPreference;
  effectiveMode: WorldMode;
  setMode: (next: TimeOfDayPreference) => void;
}

/**
 * Reads the stored preference from localStorage, validating against the
 * known set. Returns 'auto' on missing, invalid, or storage error.
 */
function readStoredPreference(): TimeOfDayPreference {
  if (typeof window === 'undefined') return 'auto';
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw && (VALID_PREFERENCES as ReadonlyArray<string>).includes(raw)) {
      return raw as TimeOfDayPreference;
    }
  } catch {
    /* ignore */
  }
  return 'auto';
}

/**
 * Owns the user's time-of-day preference and resolves the effective
 * world mode for `body[data-mode]`.
 *
 * Resolution precedence: dev `?mode=` URL > stored preference > auto.
 *
 * The body[data-mode] side effect is intentionally absent in this
 * commit — added in a later atomic migration step alongside removing
 * the existing writers in useTimeOfDay, GymPage, and TownSquarePage.
 *
 * Top-right viewport reserved for TimeOfDayCog (see spec).
 */
export function useTimeOfDayPreference(): Result {
  const [mode, setModeState] = useState<TimeOfDayPreference>(readStoredPreference);
  const autoMode = useTimeOfDay();
  const devOverride = getDevModeOverride();

  const effectiveMode: WorldMode =
    devOverride ?? (mode === 'auto' ? autoMode : mode);

  const setMode = (next: TimeOfDayPreference) => {
    setModeState(next);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
    }
  };

  return { mode, effectiveMode, setMode };
}
