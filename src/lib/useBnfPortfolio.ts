import { useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { mockBnfPortfolioSeries } from './mockData';
import { PUBLIC_LAB_STARTING_BANKROLL_CENTS } from './publicLab';
import type { BnfPortfolioPoint, BnfPortfolioSeries } from './types';

type Source = 'live' | 'mock';
export type BnfError =
  | { kind: 'not-configured'; message: string }
  | { kind: 'fetch-failed'; message: string };

export interface UseBnfPortfolioResult {
  data: BnfPortfolioSeries;
  snapshot: BnfPortfolioSnapshot;
  source: Source;
  error: BnfError | null;
  loading: boolean;
}

export interface BnfPortfolioSnapshot {
  latestPoint: BnfPortfolioPoint | null;
  currentCents: number | null;
  allTimePnlCents: number | null;
  allTimePct: number | null;
  updatedAt: string | null;
}

const COLUMNS =
  'captured_at,combined_cleared_cents,combined_baseline_cents,brandon_source,justin_source,is_partial,pct_vs_baseline';
const PORTFOLIO_REFRESH_MS = 5 * 60 * 1000;

export function bnfPortfolioSnapshot(data: BnfPortfolioSeries): BnfPortfolioSnapshot {
  const latestPoint = data.points[data.points.length - 1] ?? null;
  if (!latestPoint) {
    return {
      latestPoint: null,
      currentCents: null,
      allTimePnlCents: null,
      allTimePct: null,
      updatedAt: null,
    };
  }

  const allTimePnlCents = latestPoint.combined_cleared_cents - PUBLIC_LAB_STARTING_BANKROLL_CENTS;
  return {
    latestPoint,
    currentCents: latestPoint.combined_cleared_cents,
    allTimePnlCents,
    allTimePct: (allTimePnlCents / PUBLIC_LAB_STARTING_BANKROLL_CENTS) * 100,
    updatedAt: latestPoint.captured_at,
  };
}

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

    const fetchPortfolio = async () => {
      setLoading(true);
      try {
        const { data: rows, error: err } = await supabase!
          .from('v_bnf_portfolio')
          .select(COLUMNS)
          .order('captured_at', { ascending: false })
          .limit(1000);
        if (err) throw err;
        if (cancelled) return;
        // Newest-first + bounded: once the series exceeds the API row cap
        // (~1000 rows ≈ 41 days at hourly), an ascending unbounded query would
        // silently return only the OLDEST slice and freeze `latest`. Fetch
        // newest-first, then reverse to oldest→newest for the curve. A >1000
        // point history needs a downsampled/aggregate view (future).
        const points = ((rows ?? []) as BnfPortfolioPoint[]).slice().reverse();
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
    };

    const refreshOnReturn = () => {
      if (document.visibilityState === 'hidden') return;
      void fetchPortfolio();
    };

    void fetchPortfolio();
    const refresh = window.setInterval(() => {
      void fetchPortfolio();
    }, PORTFOLIO_REFRESH_MS);
    window.addEventListener('focus', refreshOnReturn);
    document.addEventListener('visibilitychange', refreshOnReturn);

    return () => {
      cancelled = true;
      window.clearInterval(refresh);
      window.removeEventListener('focus', refreshOnReturn);
      document.removeEventListener('visibilitychange', refreshOnReturn);
    };
  }, []);

  const snapshot = useMemo(() => bnfPortfolioSnapshot(data), [data]);

  return { data, snapshot, source, error, loading };
}
