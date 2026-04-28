import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useTimeOfDay, getDevModeOverride } from '@/hooks/useTimeOfDay';

describe('useTimeOfDay', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns daytime at noon', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 21, 12, 0));
    const { result } = renderHook(() => useTimeOfDay());
    expect(result.current).toBe('daytime');
  });

  it('returns dusk at 7pm', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 21, 19, 0));
    const { result } = renderHook(() => useTimeOfDay());
    expect(result.current).toBe('dusk');
  });

  it('returns moonlit at 1am', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 21, 1, 0));
    const { result } = renderHook(() => useTimeOfDay());
    expect(result.current).toBe('moonlit');
  });

  it('does not check URL — purely time-derived (interval always runs)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 21, 12, 0));
    const { result } = renderHook(() => useTimeOfDay());
    // Hook should always set up the interval (no early-exit for URL override)
    expect(result.current).toBe('daytime');
    // Advance time past an hour boundary: noon → 7pm
    vi.setSystemTime(new Date(2026, 3, 21, 19, 0));
    // Clear localStorage cache so compute picks up the new time
    window.localStorage.clear();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(result.current).toBe('dusk');
  });

  it('invalidates cache when hour bucket crosses', () => {
    vi.useFakeTimers();
    // 4:50pm — daytime per hourToMode (boundaries: 6-17 daytime, 17-22 dusk)
    vi.setSystemTime(new Date(2026, 3, 26, 16, 50));
    const { result: first, unmount: unmount1 } = renderHook(() => useTimeOfDay());
    expect(first.current).toBe('daytime');
    unmount1();

    // Advance to 5:10pm — only 20 min later (well inside TTL), but hour bucket 16→17 → dusk
    vi.setSystemTime(new Date(2026, 3, 26, 17, 10));
    const { result: second } = renderHook(() => useTimeOfDay());
    expect(second.current).toBe('dusk');
  });
});

describe('getDevModeOverride', () => {
  it('honors explicit search string with a valid mode', () => {
    expect(getDevModeOverride('?mode=dusk')).toBe('dusk');
    expect(getDevModeOverride('?mode=daytime')).toBe('daytime');
    expect(getDevModeOverride('?mode=moonlit')).toBe('moonlit');
  });

  it('returns null for unrecognised or absent mode param', () => {
    expect(getDevModeOverride('?other=foo')).toBe(null);
    expect(getDevModeOverride('')).toBe(null);
    expect(getDevModeOverride('?mode=lunch')).toBe(null);
  });
});
