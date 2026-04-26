import { describe, it, expect, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAgentWindow } from '@/lib/useAgentWindow';

describe('useAgentWindow', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('defaults to "24h" when no value is stored', () => {
    const { result } = renderHook(() => useAgentWindow('apex'));
    expect(result.current[0]).toBe('24h');
  });

  it('reads "7d" from localStorage on mount', () => {
    window.localStorage.setItem('gym:track-b:window:apex', '7d');
    const { result } = renderHook(() => useAgentWindow('apex'));
    expect(result.current[0]).toBe('7d');
  });

  it('reads "lifetime" from localStorage on mount', () => {
    window.localStorage.setItem('gym:track-b:window:gale', 'lifetime');
    const { result } = renderHook(() => useAgentWindow('gale'));
    expect(result.current[0]).toBe('lifetime');
  });

  it('falls back to "24h" when localStorage holds garbage', () => {
    window.localStorage.setItem('gym:track-b:window:metheus', 'banana');
    const { result } = renderHook(() => useAgentWindow('metheus'));
    expect(result.current[0]).toBe('24h');
  });

  it('persists changes to localStorage', () => {
    const { result } = renderHook(() => useAgentWindow('apex'));
    act(() => result.current[1]('7d'));
    expect(result.current[0]).toBe('7d');
    expect(window.localStorage.getItem('gym:track-b:window:apex')).toBe('7d');
  });

  it('uses an agent-scoped key (apex change does not affect gale)', () => {
    const apex = renderHook(() => useAgentWindow('apex'));
    act(() => apex.result.current[1]('lifetime'));
    const gale = renderHook(() => useAgentWindow('gale'));
    expect(gale.result.current[0]).toBe('24h');
  });
});
