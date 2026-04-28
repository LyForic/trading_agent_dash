/**
 * Context object and hook for galeWeatherContext.
 *
 * Split from galeWeatherContext.tsx so that file only exports the
 * GaleWeatherProvider component (fast-refresh requirement: a component
 * file must not export non-component values alongside components).
 */
import { createContext, useContext } from 'react';
import type { WeatherSnapshot } from './useGaleWeather';

export interface GaleWeatherState {
  current: WeatherSnapshot | null;
  source: 'live' | 'fallback' | 'loading';
}

export const GaleWeatherContext = createContext<GaleWeatherState>({
  current: null,
  source: 'loading',
});

export function useSharedGaleWeather(): GaleWeatherState {
  return useContext(GaleWeatherContext);
}
