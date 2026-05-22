// supabase/functions/leaderboard/index.ts
//
// Deno Edge Function serving the unified Trading Gym leaderboard.
//
// Reads agent_trades_public (the delayed public view), aggregates per bot into
// the dashboard's Agent shape. Metheus writes agent_trades directly;
// Apex + Gale are mirrored in from pm_bets via the
// mirror_pm_bet_to_agent_trade trigger.
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
  id: 'apex' | 'gale' | 'metheus' | 'bacon' | 'nova';
  name: string;
  nickname: string;
  market_label: string;
  sprite_url: string;
  cities_or_tags: string[];
  moves: Move[];
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
  },
  bacon: {
    id: 'bacon',
    name: 'Bacon',
    nickname: 'Chef Pig',
    market_label: 'Kalshi BTC 15m live canary',
    sprite_url: '/world-v2/actors/bacon-idle.png',
    cities_or_tags: ['BTC', 'Canary'],
    moves: [
      { name: 'Kitchen Edge', locked: false },
      { name: 'Produce Prep', locked: false },
      { name: '???', locked: true },
      { name: '???', locked: true },
    ],
  },
  nova: {
    id: 'nova',
    name: 'Nova',
    nickname: 'Celestial Phoenix',
    market_label: 'Kalshi ETH 15m (Nova)',
    sprite_url: '/world-v2/actors/nova-idle.png',
    cities_or_tags: ['ETH', '15m'],
    moves: [
      { name: 'Astral Drift', locked: false },
      { name: 'Moonline Read', locked: false },
      { name: '???', locked: true },
      { name: '???', locked: true },
    ],
  },
};

const AGENT_IDS = ['apex', 'gale', 'metheus', 'bacon', 'nova'] as const;

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
}

function buildAgent(id: string, rows: AgentTradeRow[]) {
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
        new Date(b.settled_at ?? b.entered_at).getTime() -
        new Date(a.settled_at ?? a.entered_at).getTime(),
    );
  const latestRow = sortedByClose[0];

  const latest_receipt = latestRow
    ? {
        id: `${id.toUpperCase().slice(0, 3)}-${latestRow.id.slice(0, 8).toUpperCase()}`,
        contract_ticker: latestRow.contract_ticker,
        side: latestRow.side,
        entry_price_cents: latestRow.entry_price ?? 0,
        settle_price_cents: latestRow.settle_price ?? 0,
        size: latestRow.size,
        pnl: latestRow.pnl ?? 0,
        settled_at: latestRow.settled_at ?? latestRow.entered_at,
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

const ALLOWED_ORIGINS = new Set([
  'https://gym.lyforic.com',
  'https://tradingagentdash.vercel.app',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
]);

function corsHeaders(req: Request) {
  const origin = req.headers.get('origin') ?? '';
  const allowedOrigin = ALLOWED_ORIGINS.has(origin) ? origin : 'https://gym.lyforic.com';
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    Vary: 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
  };
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req);
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: cors });
  }
  if (req.method !== 'GET') {
    return new Response('method not allowed', { status: 405, headers: cors });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return new Response('misconfigured', { status: 500, headers: cors });
  }
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  try {
    const agents = await Promise.all(
      AGENT_IDS.map(async (id) => {
        const { data, error } = await sb
          // anon-readable view (30-min delay floor); base agent_trades is revoked from anon
          .from('agent_trades_public')
          .select(
            'id,agent_id,contract_ticker,side,entry_price,size,entered_at,settled_at,settle_price,pnl,move_used',
          )
          .eq('agent_id', id)
          .order('settled_at', { ascending: false, nullsFirst: false })
          .limit(500);
        if (error) throw error;
        return buildAgent(id, (data ?? []) as AgentTradeRow[]);
      }),
    );

    return new Response(
      JSON.stringify({ updated_at: new Date().toISOString(), agents }),
      {
        headers: {
          ...cors,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=15',
        },
      },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } },
    );
  }
});
