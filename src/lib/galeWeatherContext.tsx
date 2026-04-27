import { type ReactNode } from 'react';
import { useGaleWeather } from './useGaleWeather';
import { GaleWeatherContext } from './galeWeatherContext-hooks';

/**
 * Shared subscription to useGaleWeather. Called once in the provider,
 * consumed anywhere. WorldLayer reads it to drive particles; Gale's
 * expanded card reads it to render the "Watching <city> · <temp> · <icon>"
 * badge. Without this the city rotation would double-mount and get out
 * of sync between the two surfaces.
 *
 * Context object and useSharedGaleWeather hook live in
 * galeWeatherContext-hooks.ts to satisfy fast-refresh (component files
 * must not export non-components alongside components).
 */
export function GaleWeatherProvider({ children }: { children: ReactNode }) {
  const value = useGaleWeather();
  return <GaleWeatherContext.Provider value={value}>{children}</GaleWeatherContext.Provider>;
}
