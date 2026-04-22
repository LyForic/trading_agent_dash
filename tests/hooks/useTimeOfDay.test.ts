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
});
