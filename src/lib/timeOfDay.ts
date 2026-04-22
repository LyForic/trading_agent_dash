export type WorldMode = 'daytime' | 'dusk' | 'moonlit';

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
