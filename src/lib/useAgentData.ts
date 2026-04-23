import { useEffect, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { AGENT_META, AGENT_IDS } from './agentMeta';
import { mockLeaderboard } from './mockData';
import type { Agent, AgentId, LeaderboardResponse, Receipt } from './types';

/**
 * Live leaderboard hook backed by Supabase `agent_trades` — the "formal
 * reset" table Justin stood up per the blockers doc. Metheus's bot writes
 * to it directly; Apex and Gale receive trades via the
 * `mirror_pm_bet_to_agent_trade` trigger which fires on pm_bets UPDATE for
 * those two bot_ids (trigger installed 2026-04-23 — only settles after
 * trigger install flow in, matching Brandon's "fresh start" directive).
 *
 * Falls back to mockLeaderboard if Supabase is unconfigured or the query
 * fails — preserves CI and offline dev.
 *
 * Derived fields:
 *   - total_pnl      = SUM(pnl)       (already in dollars in this table)
 *   - W/L/BE         = count by sign(pnl)
 *   - latest_receipt = newest closed row
 *   - state          = 'live' if any settled, else 'pending'
 *
 * brier_7d stays 0/0 until the signals table is populated (Phase 4).
 */

type Source = 'live' | 'mock';

interface AgentTradeRow {
  id: string;
  agent_id: string;
  contract_ticker: string;
  side: 'yes' | 'no';
  entry_price: number | null;
  size: number;
  entered_at: string;
  settled_at: string | null;
  settle_price: number | null;
  pnl: number | null;
  move_used: string | null;
  created_at: string;
}

const COLUMNS =
  'id,agent_id,contract_ticker,side,entry_price,size,entered_at,settled_at,settle_price,pnl,move_used,created_at';

function buildAgent(id: AgentId, rows: AgentTradeRow[]): Agent {
  const meta = AGENT_META[id];
  const closed = rows.filter((r) => r.pnl !== null && r.pnl !== undefined);

  let W = 0;
  let L = 0;
  let BE = 0;
  let totalPnl = 0;
  for (const r of closed) {
    const p = r.pnl ?? 0;
    totalPnl += p;
    if (p > 0) W += 1;
    else if (p < 0) L += 1;
    else BE += 1;
  }
  const settled = closed.length;

  const sortedByClose = closed
    .slice()
    .sort(
      (a, b) =>
        new Date(b.settled_at ?? b.created_at).getTime() -
        new Date(a.settled_at ?? a.created_at).getTime(),
    );
  const latestRow = sortedByClose[0];

  const latest_receipt: Receipt | null = latestRow
    ? {
        id: `${id.toUpperCase().slice(0, 3)}-${latestRow.id.slice(0, 8).toUpperCase()}`,
        contract_ticker: latestRow.contract_ticker,
        side: latestRow.side,
        entry_price_cents: latestRow.entry_price ?? 0,
        settle_price_cents: latestRow.settle_price ?? 0,
        size: latestRow.size,
        pnl: latestRow.pnl ?? 0,
        settled_at: latestRow.settled_at ?? latestRow.created_at,
      }
    : null;

  return {
    id,
    name: meta.name,
    nickname: meta.nickname,
    market_label: meta.market_label,
    sprite_url: meta.sprite_url,
    total_pnl: totalPnl,
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
            const { data: rows, error: queryError } = await supabase!
              .from('agent_trades')
              .select(COLUMNS)
              .eq('agent_id', id)
              .order('settled_at', { ascending: false, nullsFirst: false })
              .limit(500);
            if (queryError) throw queryError;
            return buildAgent(id, (rows ?? []) as AgentTradeRow[]);
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
