import { createContext, useContext, type ReactNode } from 'react';
import { useGaleWeather, type WeatherSnapshot } from './useGaleWeather';

/**
 * Shared subscription to useGaleWeather. Called once in the provider,
 * consumed anywhere. WorldLayer reads it to drive particles; Gale's
 * expanded card reads it to render the "Watching <city> · <temp> · <icon>"
 * badge. Without this the city rotation would double-mount and get out
 * of sync between the two surfaces.
 */

interface GaleWeatherState {
  current: WeatherSnapshot | null;
  source: 'live' | 'fallback' | 'loading';
}

const GaleWeatherContext = createContext<GaleWeatherState>({
  current: null,
  source: 'loading',
});

export function GaleWeatherProvider({ children }: { children: ReactNode }) {
  const value = useGaleWeather();
  return <GaleWeatherContext.Provider value={value}>{children}</GaleWeatherContext.Provider>;
}

export function useSharedGaleWeather(): GaleWeatherState {
  return useContext(GaleWeatherContext);
}
