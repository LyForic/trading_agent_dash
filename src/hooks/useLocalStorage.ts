import { useEffect, useState } from 'react';

/**
 * Typed wrapper over localStorage. Tolerates quota errors and SSR
 * (returns `initial` during server render or if JSON parse fails).
 */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* quota or private-browsing mode — ignore */
    }
  }, [key, value]);

  return [value, setValue] as const;
}
