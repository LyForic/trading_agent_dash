import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useTimeOfDay } from '@/hooks/useTimeOfDay';

describe('useTimeOfDay', () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.body.removeAttribute('data-mode');
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

  it('sets body[data-mode] as a side effect so CSS variable inheritance works', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 21, 19, 0));
    renderHook(() => useTimeOfDay());
    expect(document.body.dataset.mode).toBe('dusk');
  });

  it('invalidates cache when hour bucket crosses', () => {
    vi.useFakeTimers();
    // 4:30pm — daytime per hourToMode (boundaries: 6-17 daytime, 17-22 dusk)
    vi.setSystemTime(new Date(2026, 3, 26, 16, 30));
    const { result: first, unmount: unmount1 } = renderHook(() => useTimeOfDay());
    expect(first.current).toBe('daytime');
    unmount1();

    // Advance to 5:30pm — same TTL window (under 60 min) but new hour bucket → dusk
    vi.setSystemTime(new Date(2026, 3, 26, 17, 30));
    const { result: second } = renderHook(() => useTimeOfDay());
    expect(second.current).toBe('dusk');
  });
});
