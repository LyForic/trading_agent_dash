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

import { useBnfPortfolio } from '@/lib/useBnfPortfolio';

describe('useBnfPortfolio — fetch-failed', () => {
  beforeEach(() => {
    failingFromMock.mockClear();
  });

  it('reports errorKind="fetch-failed" when Supabase query throws', async () => {
    const { result } = renderHook(() => useBnfPortfolio());

    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });

    expect(result.current.error).toMatchObject({
      kind: 'fetch-failed',
      message: expect.stringContaining('Network error'),
    });
    expect(result.current.loading).toBe(false);
  });
});
