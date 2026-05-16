import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { mockBnfPortfolioSeries } from './mockData';
import type { BnfPortfolioPoint, BnfPortfolioSeries } from './types';

type Source = 'live' | 'mock';
export type BnfError =
  | { kind: 'not-configured'; message: string }
  | { kind: 'fetch-failed'; message: string };

export interface UseBnfPortfolioResult {
  data: BnfPortfolioSeries;
  source: Source;
  error: BnfError | null;
  loading: boolean;
}

const COLUMNS =
  'captured_at,combined_cleared_cents,combined_baseline_cents,brandon_source,justin_source,is_partial,pct_vs_baseline';

export function useBnfPortfolio(): UseBnfPortfolioResult {
  const [data, setData] = useState<BnfPortfolioSeries>(
    () => (isSupabaseConfigured ? { points: [], updated_at: new Date().toISOString() }
                                 : mockBnfPortfolioSeries),
  );
  const [source, setSource] = useState<Source>(() => (isSupabaseConfigured ? 'live' : 'mock'));
  const [error, setError] = useState<BnfError | null>(
    () => (isSupabaseConfigured
      ? null
      : { kind: 'not-configured', message: 'Supabase not configured — using mock data' }),
  );
  const [loading, setLoading] = useState<boolean>(() => isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    (async () => {
      try {
        const { data: rows, error: err } = await supabase!
          .from('v_bnf_portfolio')
          .select(COLUMNS)
          .order('captured_at', { ascending: true });
        if (err) throw err;
        if (cancelled) return;
        const points = (rows ?? []) as BnfPortfolioPoint[];
        setData({
          points,
          updated_at: points.length
            ? points[points.length - 1].captured_at
            : new Date().toISOString(),
        });
        setSource('live');
        setError(null);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError({ kind: 'fetch-failed', message: (e as Error).message });
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return { data, source, error, loading };
}
