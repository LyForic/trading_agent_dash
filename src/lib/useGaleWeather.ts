import { useEffect, useRef, useState } from 'react';
import { AGENT_META } from './agentMeta';

/**
 * Live weather for Gale's window. Cycles through her five cities on a
 * 90-second interval so the room feels alive. Calls the `weather` Edge
 * Function (keeps the OpenWeather key server-side); response is cached
 * in localStorage for 10 minutes per city so typical session stays well
 * under the free tier.
 *
 * Graceful fallback: if the Edge Function errors (fresh OpenWeather keys
 * take up to 2h to activate, network hiccups, etc.), the hook falls back
 * to a static per-city guess so the particles still render. When the
 * function recovers the hook naturally swaps back to live on the next
 * interval tick.
 */

export type WeatherCondition =
  | 'rain'
  | 'snow'
  | 'storm'
  | 'clouds'
  | 'clear'
  | 'mist';

export interface WeatherSnapshot {
  city: string;
  label: string;
  condition: WeatherCondition;
  temp_f: number;
  observed_at: string;
}

type Source = 'live' | 'fallback' | 'loading';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

const CACHE_TTL_MS = 10 * 60 * 1000;
const ROTATE_MS = 90_000;
const STORAGE_PREFIX = 'gym:weather:';

const FALLBACK_BY_CITY: Record<string, WeatherSnapshot> = {
  MIA: { city: 'MIA', label: 'Miami', condition: 'clear', temp_f: 82, observed_at: '' },
  LAX: { city: 'LAX', label: 'Los Angeles', condition: 'clear', temp_f: 71, observed_at: '' },
  NYC: { city: 'NYC', label: 'New York', condition: 'clouds', temp_f: 58, observed_at: '' },
  CHI: { city: 'CHI', label: 'Chicago', condition: 'rain', temp_f: 52, observed_at: '' },
  DEN: { city: 'DEN', label: 'Denver', condition: 'clouds', temp_f: 55, observed_at: '' },
};

function readCache(city: string): WeatherSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + city);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: WeatherSnapshot; expires: number };
    if (parsed.expires < Date.now()) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function writeCache(city: string, data: WeatherSnapshot) {
  try {
    localStorage.setItem(
      STORAGE_PREFIX + city,
      JSON.stringify({ data, expires: Date.now() + CACHE_TTL_MS }),
    );
  } catch {
    // quota exceeded, ignore
  }
}

async function fetchWeather(city: string): Promise<WeatherSnapshot> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('supabase env missing');
  }
  const url = `${SUPABASE_URL}/functions/v1/weather?city=${encodeURIComponent(city)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const body = (await res.json()) as WeatherSnapshot | { error: string };
  if ('error' in body) throw new Error(body.error);
  return body;
}

export function useGaleWeather(): {
  current: WeatherSnapshot | null;
  source: Source;
} {
  const cities = AGENT_META.gale.cities_or_tags;
  const [current, setCurrent] = useState<WeatherSnapshot | null>(null);
  const [source, setSource] = useState<Source>('loading');
  const indexRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function loadCity(city: string) {
      const cached = readCache(city);
      if (cached) {
        if (!cancelled) {
          setCurrent(cached);
          setSource('live');
        }
        return;
      }
      try {
        const fresh = await fetchWeather(city);
        if (cancelled) return;
        writeCache(city, fresh);
        setCurrent(fresh);
        setSource('live');
      } catch {
        if (cancelled) return;
        setCurrent(FALLBACK_BY_CITY[city] ?? FALLBACK_BY_CITY.NYC);
        setSource('fallback');
      }
    }

    loadCity(cities[indexRef.current]);
    const id = window.setInterval(() => {
      indexRef.current = (indexRef.current + 1) % cities.length;
      loadCity(cities[indexRef.current]);
    }, ROTATE_MS);

    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [cities]);

  return { current, source };
}
