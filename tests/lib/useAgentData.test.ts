import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock must be declared before importing the hook under test.
// isSupabaseConfigured=false triggers the not-configured path.
vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

import { useAgentData } from '@/lib/useAgentData';
import { AGENT_IDS } from '@/lib/agentMeta';
import type { AgentId, PerformanceWindow } from '@/lib/types';

function windows(overrides: Partial<Record<AgentId, PerformanceWindow>> = {}): Record<AgentId, PerformanceWindow> {
  return AGENT_IDS.reduce<Record<AgentId, PerformanceWindow>>((acc, id) => {
    acc[id] = overrides[id] ?? '24h';
    return acc;
  }, {} as Record<AgentId, PerformanceWindow>);
}

describe('useAgentData errorKind', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('reports errorKind="not-configured" when Supabase is not configured', () => {
    const { result } = renderHook(() => useAgentData(windows()));
    expect(result.current.error).toEqual({
      kind: 'not-configured',
      message: expect.any(String),
    });
    expect(result.current.source).toBe('mock');
  });
});

describe('useAgentData mock-mode window honoring', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('mock-mode VM recomputes when windowsByAgent changes', () => {
    const { result, rerender } = renderHook(
      ({ windows }: { windows: Record<AgentId, PerformanceWindow> }) =>
        useAgentData(windows),
      {
        initialProps: {
          windows: windows(),
        },
      },
    );

    const apex24h = result.current.cardViewModels.apex;

    rerender({ windows: windows({ apex: 'lifetime' }) });

    const apexLifetime = result.current.cardViewModels.apex;

    // lifetime window aggregates all mock trades (50) vs 24h window (4).
    expect(apexLifetime.windowSettledCount).toBeGreaterThan(apex24h.windowSettledCount);
  });
});
