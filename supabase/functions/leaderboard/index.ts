// supabase/functions/leaderboard/index.ts
//
// Deno Edge Function serving the unified Trading Gym leaderboard.
//
// Reads pm_bets, aggregates per bot into the dashboard's Agent shape,
// applies the per-agent "fresh start" cutoff (currently only Apex).
// Matches the logic in src/lib/useAgentData.ts so the client can be
// pointed at either source without a shape change.
//
// Deploy:
//   supabase link --project-ref zzfmmsuzzbbrfptmtmfu
//   supabase functions deploy leaderboard
// Call:
//   GET https://zzfmmsuzzbbrfptmtmfu.supabase.co/functions/v1/leaderboard
//   Authorization: Bearer <anon key>   (Supabase enforces this)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface Move {
  name: string;
  locked: boolean;
}

interface AgentMeta {
  id: 'apex' | 'gale' | 'metheus';
  name: string;
  nickname: string;
  market_label: string;
  sprite_url: string;
  cities_or_tags: string[];
  moves: Move[];
  pm_bets_cutoff_iso: string | null;
}

// Duplicated verbatim from src/lib/agentMeta.ts. If you edit this,
// edit both — or refactor to a shared module when Deno/npm layouts
// in this repo make that cheap.
const AGENT_META: Record<string, AgentMeta> = {
  apex: {
    id: 'apex',
    name: 'Apex',
    nickname: 'Tempo Reader',
    market_label: 'Kalshi BTC (KXBTCD / KXBTC15M)',
    sprite_url: '/sprites/apex/rotations/south.png',
    cities_or_tags: ['BTC', 'ETH'],
    moves: [
      { name: 'VR Gate', locked: false },
      { name: 'Momentum Direction', locked: false },
      { name: '???', locked: true },
      { name: '???', locked: true },
    ],
    pm_bets_cutoff_iso: '2026-04-23T00:00:00Z',
  },
  gale: {
    id: 'gale',
    name: 'Gale',
    nickname: 'Weather Whisperer',
    market_label: 'Kalshi weather (KXHIGH)',
    sprite_url: '/sprites/gale/rotations/south.png',
    cities_or_tags: ['MIA', 'LAX', 'NYC', 'CHI', 'DEN'],
    moves: [
      { name: 'Normal CDF', locked: false },
      { name: 'Seasonal Bias', locked: false },
      { name: '???', locked: true },
      { name: '???', locked: true },
    ],
    pm_bets_cutoff_iso: null,
  },
  metheus: {
    id: 'metheus',
    name: 'Metheus',
    nickname: 'Long Arc',
    market_label: 'Kalshi BTC 15m (KXBTC15M)',
    sprite_url: '/sprites/metheus/rotations/south.png',
    cities_or_tags: ['BTC'],
    moves: [
      { name: 'Snipe: New', locked: false },
      { name: '???', locked: true },
      { name: '???', locked: true },
      { name: '???', locked: true },
    ],
    pm_bets_cutoff_iso: null,
  },
};

const AGENT_IDS = ['apex', 'gale', 'metheus'] as const;

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

function approximateSettlePrice(row: PmBetsRow): number {
  if (row.exit_fill_price !== null && row.exit_fill_price !== undefined) return row.exit_fill_price;
  if (row.exit_price !== null && row.exit_price !== undefined) return row.exit_price;
  if (row.pnl_cents !== null && row.entry_price !== null && row.contracts > 0) {
    const perContract = row.pnl_cents / row.contracts;
    const derived = row.direction === 'YES' ? row.entry_price + perContract : row.entry_price - perContract;
    return Math.round(derived);
  }
  return 0;
}

function buildAgent(id: string, rows: PmBetsRow[]) {
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

  const latest_receipt = latestRow
    ? {
        id: latestRow.id.slice(0, 18).toUpperCase(),
        contract_ticker: latestRow.ticker,
        side: latestRow.direction.toLowerCase(),
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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response('misconfigured', { status: 500, headers: CORS_HEADERS });
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  try {
    const agents = await Promise.all(
      AGENT_IDS.map(async (id) => {
        const meta = AGENT_META[id];
        let q = sb
          .from('pm_bets')
          .select(
            'id,bot_id,ticker,direction,contracts,entry_price,exit_price,exit_fill_price,pnl_cents,status,settlement_time,created_at',
          )
          .eq('bot_id', id)
          .order('created_at', { ascending: false })
          .limit(500);
        if (meta.pm_bets_cutoff_iso) q = q.gte('created_at', meta.pm_bets_cutoff_iso);
        const { data, error } = await q;
        if (error) throw error;
        return buildAgent(id, (data ?? []) as PmBetsRow[]);
      }),
    );

    return new Response(
      JSON.stringify({ updated_at: new Date().toISOString(), agents }),
      {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=15',
        },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
