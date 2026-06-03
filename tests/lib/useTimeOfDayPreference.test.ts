import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/hooks/useTimeOfDay', () => ({
  useTimeOfDay: vi.fn(),
  getDevModeOverride: vi.fn(),
}));

import { useTimeOfDay, getDevModeOverride } from '@/hooks/useTimeOfDay';
import { useTimeOfDayPreference } from '@/lib/useTimeOfDayPreference';

const STORAGE_KEY = 'gym:settings:time-mode';

function makeWrapper(initialSearch = '') {
  window.history.pushState(null, '', initialSearch ? `/${initialSearch}` : '/');
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(React.Fragment, null, children);
  };
}

describe('useTimeOfDayPreference', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState(null, '', '/');
    document.body.removeAttribute('data-mode');
    vi.mocked(useTimeOfDay).mockReturnValue('daytime');
    vi.mocked(getDevModeOverride).mockReturnValue(null);
  });

  it('defaults to "auto" when localStorage is empty', () => {
    const { result } = renderHook(() => useTimeOfDayPreference(), { wrapper: makeWrapper() });
    expect(result.current.mode).toBe('auto');
  });

  it('reads stored "dusk" preference from localStorage on init', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dusk');
    const { result } = renderHook(() => useTimeOfDayPreference(), { wrapper: makeWrapper() });
    expect(result.current.mode).toBe('dusk');
  });

  it('persists setMode to localStorage and updates state', () => {
    const { result } = renderHook(() => useTimeOfDayPreference(), { wrapper: makeWrapper() });
    act(() => result.current.setMode('moonlit'));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('moonlit');
    expect(result.current.mode).toBe('moonlit');
  });

  it('falls back to "auto" when localStorage holds an invalid value', () => {
    window.localStorage.setItem(STORAGE_KEY, 'lunch');
    const { result } = renderHook(() => useTimeOfDayPreference(), { wrapper: makeWrapper() });
    expect(result.current.mode).toBe('auto');
  });

  it('effectiveMode equals autoMode when preference is "auto"', () => {
    vi.mocked(useTimeOfDay).mockReturnValue('daytime');
    const { result } = renderHook(() => useTimeOfDayPreference(), { wrapper: makeWrapper() });
    expect(result.current.mode).toBe('auto');
    expect(result.current.effectiveMode).toBe('daytime');
  });

  it('effectiveMode equals stored preference when forced (preference wins over autoMode)', () => {
    window.localStorage.setItem(STORAGE_KEY, 'moonlit');
    vi.mocked(useTimeOfDay).mockReturnValue('daytime');
    const { result } = renderHook(() => useTimeOfDayPreference(), { wrapper: makeWrapper() });
    expect(result.current.effectiveMode).toBe('moonlit');
  });

  it('dev URL override wins over stored preference (top precedence)', () => {
    vi.mocked(getDevModeOverride).mockReturnValue('dusk');
    window.localStorage.setItem(STORAGE_KEY, 'moonlit');
    const { result } = renderHook(() => useTimeOfDayPreference(), { wrapper: makeWrapper() });
    expect(result.current.effectiveMode).toBe('dusk');
  });

  it('dev URL override wins over auto', () => {
    vi.mocked(getDevModeOverride).mockReturnValue('dusk');
    vi.mocked(useTimeOfDay).mockReturnValue('daytime');
    const { result } = renderHook(() => useTimeOfDayPreference(), { wrapper: makeWrapper() });
    expect(result.current.mode).toBe('auto');
    expect(result.current.effectiveMode).toBe('dusk');
  });

  it('does not crash when localStorage.getItem throws', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const { result } = renderHook(() => useTimeOfDayPreference(), { wrapper: makeWrapper() });
    expect(result.current.mode).toBe('auto');
    spy.mockRestore();
  });

  it('does not crash when localStorage.setItem throws; state still updates', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const { result } = renderHook(() => useTimeOfDayPreference(), { wrapper: makeWrapper() });
    expect(() => act(() => result.current.setMode('dusk'))).not.toThrow();
    expect(result.current.mode).toBe('dusk');
  });

  it('writes body[data-mode] on mount via useLayoutEffect (effective mode)', () => {
    vi.mocked(useTimeOfDay).mockReturnValue('dusk');
    renderHook(() => useTimeOfDayPreference(), { wrapper: makeWrapper() });
    expect(document.body.dataset.mode).toBe('dusk');
  });

  it('passes location.search to getDevModeOverride (re-evaluates on navigation)', () => {
    // Mock to return based on the search arg passed to it
    vi.mocked(getDevModeOverride).mockImplementation((search?: string) => {
      if (search?.includes('mode=dusk')) return 'dusk';
      return null;
    });
    vi.mocked(useTimeOfDay).mockReturnValue('daytime');

    // Render with ?mode=dusk in the URL
    const { result } = renderHook(
      () => useTimeOfDayPreference(),
      { wrapper: makeWrapper('?mode=dusk') },
    );
    expect(result.current.effectiveMode).toBe('dusk');

    // Render with no search param — devOverride should be null → falls back to auto
    const { result: result2 } = renderHook(
      () => useTimeOfDayPreference(),
      { wrapper: makeWrapper('') },
    );
    expect(result2.current.effectiveMode).toBe('daytime');
  });
});
