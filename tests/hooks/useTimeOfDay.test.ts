import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';

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
