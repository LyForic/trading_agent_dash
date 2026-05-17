import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/supabase', () => ({
  supabase: null,
  isSupabaseConfigured: false,
}));

import { useBnfPortfolio } from '@/lib/useBnfPortfolio';

describe('useBnfPortfolio (not-configured → mock)', () => {
  beforeEach(() => window.localStorage.clear());

  it('falls back to mock series and reports source=mock', async () => {
    const { result } = renderHook(() => useBnfPortfolio());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.source).toBe('mock');
    expect(result.current.data.points.length).toBeGreaterThan(0);
    expect(result.current.error?.kind).toBe('not-configured');
  });
});
