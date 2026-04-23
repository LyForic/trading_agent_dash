import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { AGENT_META, AGENT_IDS } from './agentMeta';
import { mockLeaderboard } from './mockData';
import type { Agent, AgentId, LeaderboardResponse, Receipt } from './types';

/**
 * Live leaderboard hook backed by Supabase `pm_bets`.
 *
 * Why pm_bets and not agent_trades: pm_bets is the unified table all
 * three bots already write to (apex 753 rows, gale 115, metheus 132).
 * agent_trades is Justin's 3-row Metheus-only side experiment. Using
 * pm_bets avoids needing a Mac-Studio mirror job entirely.
 *
 * The hook queries one agent at a time (small tables, fine to fan-out),
 * aggregates client-side into the existing `Agent` shape so nothing
 * downstream of App.tsx has to change, and falls back to `mockLeaderboard`
 * if Supabase is unconfigured or the network hiccups — preserves CI and
 * offline dev.
 *
 * Surface fields we derive from pm_bets:
 *   - total_pnl  = SUM(pnl_cents) / 100
 *   - record     = count by sign(pnl_cents): +=W, -=L, 0=BE
 *   - latest_receipt = most recent closed row
 *   - state      = 'live' if any settled rows, else 'pending'
 *
 * brier_7d stays 0/0 for now — calibration data lives elsewhere and
 * Phase 4 will wire that in once the signals table lands.
 */

type Source = 'live' | 'mock';

interface PmBetsRow {
  id: string;
  bot_id: string;
  ticker: string;
  direction: 'YES' | 'NO';
  contracts: number;
  entry_price: number | null;
  exit_price: number | null;
  exit_fill_price: number | null;
  pnl_cents: number | null;
  status: string | null;
  settlement_time: string | null;
  created_at: string;
}

const PM_BETS_COLUMNS =
  'id,bot_id,ticker,direction,contracts,entry_price,exit_price,exit_fill_price,pnl_cents,status,settlement_time,created_at';

function approximateSettlePrice(row: PmBetsRow): number {
  // Prefer the real exit fill/settle price when we have it.
  if (row.exit_fill_price !== null && row.exit_fill_price !== undefined) return row.exit_fill_price;
  if (row.exit_price !== null && row.exit_price !== undefined) return row.exit_price;
  // Otherwise derive from pnl_cents and entry_price. For YES the contract
  // gained (settle - entry); for NO it gained (entry - settle). Solve.
  if (row.pnl_cents !== null && row.entry_price !== null && row.contracts > 0) {
    const perContract = row.pnl_cents / row.contracts;
    const derived = row.direction === 'YES' ? row.entry_price + perContract : row.entry_price - perContract;
    return Math.round(derived);
  }
  return 0;
}

function buildAgent(id: AgentId, rows: PmBetsRow[]): Agent {
  const meta = AGENT_META[id];
  const closed = rows.filter((r) => r.pnl_cents !== null && r.pnl_cents !== undefined);

  let W = 0;
  let L = 0;
  let BE = 0;
  let totalPnlCents = 0;
  for (const r of closed) {
    const p = r.pnl_cents ?? 0;
    totalPnlCents += p;
    if (p > 0) W += 1;
    else if (p < 0) L += 1;
    else BE += 1;
  }
  const settled = closed.length;

  const sortedByClose = closed
    .slice()
    .sort(
      (a, b) =>
        new Date(b.settlement_time ?? b.created_at).getTime() -
        new Date(a.settlement_time ?? a.created_at).getTime(),
    );
  const latestRow = sortedByClose[0];

  const latest_receipt: Receipt | null = latestRow
    ? {
        id: latestRow.id.slice(0, 18).toUpperCase(),
        contract_ticker: latestRow.ticker,
        side: latestRow.direction.toLowerCase() as 'yes' | 'no',
        entry_price_cents: latestRow.entry_price ?? 0,
        settle_price_cents: approximateSettlePrice(latestRow),
        size: latestRow.contracts,
        pnl: (latestRow.pnl_cents ?? 0) / 100,
        settled_at: latestRow.settlement_time ?? latestRow.created_at,
      }
    : null;

  return {
    id,
    name: meta.name,
    nickname: meta.nickname,
    market_label: meta.market_label,
    sprite_url: meta.sprite_url,
    total_pnl: totalPnlCents / 100,
    record: { W, L, BE, settled },
    brier_7d: { value: 0, n: 0 },
    cities_or_tags: meta.cities_or_tags,
    moves: meta.moves,
    open_position: null,
    latest_receipt,
    state: settled > 0 ? 'live' : 'pending',
  };
}

export interface UseAgentDataResult {
  data: LeaderboardResponse;
  source: Source;
  error: string | null;
  loading: boolean;
}

export function useAgentData(): UseAgentDataResult {
  const [data, setData] = useState<LeaderboardResponse>(mockLeaderboard);
  const [source, setSource] = useState<Source>('mock');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase not configured — using mock data');
      setLoading(false);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const agents = await Promise.all(
          AGENT_IDS.map(async (id) => {
            const meta = AGENT_META[id];
            let query = supabase!
              .from('pm_bets')
              .select(PM_BETS_COLUMNS)
              .eq('bot_id', id)
              .order('created_at', { ascending: false })
              .limit(500);
            if (meta.pm_bets_cutoff_iso) {
              query = query.gte('created_at', meta.pm_bets_cutoff_iso);
            }
            const { data: rows, error: queryError } = await query;
            if (queryError) throw queryError;
            return buildAgent(id, (rows ?? []) as PmBetsRow[]);
          }),
        );

        if (cancelled) return;

        setData({
          updated_at: new Date().toISOString(),
          agents,
        });
        setSource('live');
        setError(null);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return { data, source, error, loading };
}
