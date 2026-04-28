import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { failingFromMock } = vi.hoisted(() => ({
  failingFromMock: vi.fn(() => {
    throw new Error('Network error during query');
  }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: failingFromMock,
  },
  isSupabaseConfigured: true,
}));

import { useAgentData } from '@/lib/useAgentData';
import type { AgentId, PerformanceWindow } from '@/lib/types';

describe('useAgentData errorKind — fetch-failed', () => {
  beforeEach(() => {
    failingFromMock.mockClear();
  });

  it('reports errorKind="fetch-failed" when Supabase queries throw', async () => {
    const windows: Record<AgentId, PerformanceWindow> = {
      apex: '24h', gale: '24h', metheus: '24h',
    };
    const { result } = renderHook(() => useAgentData(windows));

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error).toMatchObject({
      kind: 'fetch-failed',
      message: expect.stringContaining('Network error'),
    });
  });
});
