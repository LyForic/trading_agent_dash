import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

const { limitMock } = vi.hoisted(() => ({
  limitMock: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => ({ limit: limitMock }),
      }),
    }),
  },
  isSupabaseConfigured: true,
}));

import { useBnfPortfolio } from '@/lib/useBnfPortfolio';

describe('useBnfPortfolio — live ordering', () => {
  beforeEach(() => limitMock.mockReset());

  it('fetches newest-first and stores oldest→newest so latest is correct', async () => {
    limitMock.mockResolvedValue({
      data: [
        { captured_at: '2026-05-16T20:00:00Z', combined_cleared_cents: 691000, combined_baseline_cents: 680000, brandon_source: 'kalshi', justin_source: 'kalshi', is_partial: false, pct_vs_baseline: 1.62 },
        { captured_at: '2026-05-16T19:00:00Z', combined_cleared_cents: 685000, combined_baseline_cents: 680000, brandon_source: 'kalshi', justin_source: 'kalshi', is_partial: false, pct_vs_baseline: 0.74 },
      ],
      error: null,
    });
    const { result } = renderHook(() => useBnfPortfolio());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe('live');
    const pts = result.current.data.points;
    expect(pts[0].captured_at).toBe('2026-05-16T19:00:00Z');
    expect(pts[pts.length - 1].combined_cleared_cents).toBe(691000);
  });
});
