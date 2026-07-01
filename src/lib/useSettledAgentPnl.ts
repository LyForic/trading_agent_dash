import { useEffect, useState } from 'react';
import { AGENT_IDS } from './agentMeta';
import { mockTradeLog } from './mockData';
import { subscribeToPublicTradeEvents } from './publicTradeEvents';
import { isSupabaseConfigured, supabase } from './supabase';
import type { AgentId, PerformanceWindow } from './types';

type Source = 'live' | 'mock';

export type SettledAgentPnlError =
  | { kind: 'not-configured'; message: string }
  | { kind: 'fetch-failed'; message: string };

export interface SettledAgentPnlWindow {
  cents: number;
  settled: number;
}

export interface UseSettledAgentPnlResult {
  windows: Record<PerformanceWindow, SettledAgentPnlWindow | null>;
  source: Source;
  error: SettledAgentPnlError | null;
  loading: boolean;
}

interface TradePnlRow {
  agent_id: AgentId;
  pnl: number | string | null;
  settled_at: string | null;
}

interface LifetimeStatsRow {
  agent_id: AgentId;
  settled: number | string | null;
  total_pnl: number | string | null;
}

const EMPTY_WINDOWS: Record<PerformanceWindow, SettledAgentPnlWindow | null> = {
  '24h': null,
  '7d': null,
  lifetime: null,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const SETTLED_AGENT_PNL_REFRESH_MS = 90_000;

function pnlToCents(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function settledCount(value: number | string | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function aggregateTradeRows(rows: TradePnlRow[], nowMs: number): Pick<Record<PerformanceWindow, SettledAgentPnlWindow>, '24h' | '7d'> {
  const lower24h = nowMs - DAY_MS;
  const result = {
    '24h': { cents: 0, settled: 0 },
    '7d': { cents: 0, settled: 0 },
  };

  for (const row of rows) {
    if (row.pnl === null || row.settled_at === null) continue;
    const settledMs = Date.parse(row.settled_at);
    if (!Number.isFinite(settledMs)) continue;
    const pnlCents = pnlToCents(row.pnl);
    result['7d'].cents += pnlCents;
    result['7d'].settled += 1;
    if (settledMs >= lower24h) {
      result['24h'].cents += pnlCents;
      result['24h'].settled += 1;
    }
  }

  return result;
}

function aggregateLifetimeRows(rows: LifetimeStatsRow[]): SettledAgentPnlWindow {
  return rows.reduce<SettledAgentPnlWindow>(
    (acc, row) => ({
      cents: acc.cents + pnlToCents(row.total_pnl),
      settled: acc.settled + settledCount(row.settled),
    }),
    { cents: 0, settled: 0 },
  );
}

function mockSettledAgentPnlWindows(nowMs = Date.now()): Record<PerformanceWindow, SettledAgentPnlWindow> {
  const rows = AGENT_IDS.flatMap((agentId) =>
    (mockTradeLog[agentId] ?? []).map((trade) => ({
      agent_id: agentId,
      pnl: trade.pnl,
      settled_at: trade.settled_at,
    })),
  );
  const windowed = aggregateTradeRows(rows, nowMs);
  const lifetime = aggregateLifetimeRows(
    AGENT_IDS.map((agentId) => {
      const trades = mockTradeLog[agentId] ?? [];
      return {
        agent_id: agentId,
        settled: trades.length,
        total_pnl: trades.reduce((sum, trade) => sum + trade.pnl, 0),
      };
    }),
  );

  return { ...windowed, lifetime };
}

export function useSettledAgentPnl(): UseSettledAgentPnlResult {
  const [windows, setWindows] = useState<Record<PerformanceWindow, SettledAgentPnlWindow | null>>(
    () => (isSupabaseConfigured ? EMPTY_WINDOWS : mockSettledAgentPnlWindows()),
  );
  const [source, setSource] = useState<Source>(() => (isSupabaseConfigured ? 'live' : 'mock'));
  const [error, setError] = useState<SettledAgentPnlError | null>(
    () =>
      isSupabaseConfigured
        ? null
        : { kind: 'not-configured', message: 'Supabase not configured — using mock data' },
  );
  const [loading, setLoading] = useState<boolean>(() => isSupabaseConfigured);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const requestRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      setRefreshNonce((value) => value + 1);
    };

    const refresh = window.setInterval(requestRefresh, SETTLED_AGENT_PNL_REFRESH_MS);
    const unsubscribeFromTradeEvents = subscribeToPublicTradeEvents(requestRefresh, 'settled-agent-pnl');
    window.addEventListener('focus', requestRefresh);
    document.addEventListener('visibilitychange', requestRefresh);

    return () => {
      window.clearInterval(refresh);
      unsubscribeFromTradeEvents();
      window.removeEventListener('focus', requestRefresh);
      document.removeEventListener('visibilitychange', requestRefresh);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    let cancelled = false;
    const nowMs = Date.now();
    const lower7d = new Date(nowMs - 7 * DAY_MS).toISOString();

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    (async () => {
      try {
        const agentIds = [...AGENT_IDS];
        const [tradeResult, lifetimeResult] = await Promise.all([
          supabase
            .from('agent_trades_public')
            .select('agent_id,pnl,settled_at')
            .in('agent_id', agentIds)
            .not('pnl', 'is', null)
            .gte('settled_at', lower7d)
            .order('settled_at', { ascending: false })
            .limit(5000),
          supabase
            .from('agent_lifetime_stats')
            .select('agent_id,settled,total_pnl')
            .in('agent_id', agentIds),
        ]);

        if (tradeResult.error) throw tradeResult.error;
        if (lifetimeResult.error) throw lifetimeResult.error;
        if (cancelled) return;

        const windowed = aggregateTradeRows((tradeResult.data ?? []) as TradePnlRow[], nowMs);
        const lifetime = aggregateLifetimeRows((lifetimeResult.data ?? []) as LifetimeStatsRow[]);
        setWindows({ ...windowed, lifetime });
        setSource('live');
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError({ kind: 'fetch-failed', message: (err as Error).message });
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshNonce]);

  return { windows, source, error, loading };
}
