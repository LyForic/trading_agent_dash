import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

vi.mock('@/hooks/useTimeOfDay', () => ({
  useTimeOfDay: vi.fn(),
  getDevModeOverride: vi.fn(),
}));

import { useTimeOfDay, getDevModeOverride } from '@/hooks/useTimeOfDay';
import { useTimeOfDayPreference } from '@/lib/useTimeOfDayPreference';

const STORAGE_KEY = 'gym:settings:time-mode';

describe('useTimeOfDayPreference', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(useTimeOfDay).mockReturnValue('daytime');
    vi.mocked(getDevModeOverride).mockReturnValue(null);
  });

  it('defaults to "auto" when localStorage is empty', () => {
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.mode).toBe('auto');
  });

  it('reads stored "dusk" preference from localStorage on init', () => {
    window.localStorage.setItem(STORAGE_KEY, 'dusk');
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.mode).toBe('dusk');
  });

  it('persists setMode to localStorage and updates state', () => {
    const { result } = renderHook(() => useTimeOfDayPreference());
    act(() => result.current.setMode('moonlit'));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('moonlit');
    expect(result.current.mode).toBe('moonlit');
  });

  it('falls back to "auto" when localStorage holds an invalid value', () => {
    window.localStorage.setItem(STORAGE_KEY, 'lunch');
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.mode).toBe('auto');
  });

  it('effectiveMode equals autoMode when preference is "auto"', () => {
    vi.mocked(useTimeOfDay).mockReturnValue('daytime');
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.mode).toBe('auto');
    expect(result.current.effectiveMode).toBe('daytime');
  });

  it('effectiveMode equals stored preference when forced (preference wins over autoMode)', () => {
    window.localStorage.setItem(STORAGE_KEY, 'moonlit');
    vi.mocked(useTimeOfDay).mockReturnValue('daytime');
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.effectiveMode).toBe('moonlit');
  });

  it('dev URL override wins over stored preference (top precedence)', () => {
    vi.mocked(getDevModeOverride).mockReturnValue('dusk');
    window.localStorage.setItem(STORAGE_KEY, 'moonlit');
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.effectiveMode).toBe('dusk');
  });

  it('dev URL override wins over auto', () => {
    vi.mocked(getDevModeOverride).mockReturnValue('dusk');
    vi.mocked(useTimeOfDay).mockReturnValue('daytime');
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.mode).toBe('auto');
    expect(result.current.effectiveMode).toBe('dusk');
  });

  it('does not crash when localStorage.getItem throws', () => {
    const spy = vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(result.current.mode).toBe('auto');
    spy.mockRestore();
  });

  it('does not crash when localStorage.setItem throws; state still updates', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    const { result } = renderHook(() => useTimeOfDayPreference());
    expect(() => act(() => result.current.setMode('dusk'))).not.toThrow();
    expect(result.current.mode).toBe('dusk');
  });
});
