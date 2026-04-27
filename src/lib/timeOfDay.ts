export type WorldMode = 'daytime' | 'dusk' | 'moonlit';

/**
 * User preference for time-of-day mode. `'auto'` defers to the
 * hour-derived value from `useTimeOfDay`; the three explicit values
 * pin the world to a specific mode regardless of clock.
 */
export type TimeOfDayPreference = 'auto' | WorldMode;

/**
 * Maps a local-time hour (0-23) to the Trading Gym world-layer mode
 * per spec §3.1. Cheap pure function so it's safe to call on every render.
 *
 *   6am–5pm  → daytime   (warm cream walls, sunlit)
 *   5pm–10pm → dusk      (deep blue sky, lamp on)
 *   10pm–6am → moonlit   (navy, moon silhouette)
 */
export function hourToMode(hour: number): WorldMode {
  if (hour >= 6 && hour < 17) return 'daytime';
  if (hour >= 17 && hour < 22) return 'dusk';
  return 'moonlit';
}
