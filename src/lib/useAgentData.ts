import { useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { AGENT_META, AGENT_IDS } from './agentMeta';
import { mockLeaderboard, mockCardViewModels } from './mockData';
import type {
  Agent,
  AgentId,
  LeaderboardResponse,
  OpenPosition,
  PerformanceWindow,
  Receipt,
  TradeLogEntry,
} from './types';

type Source = 'live' | 'mock';

interface AgentTradeRow {
  id: string;
  agent_id: AgentId;
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

interface LifetimeStatsRow {
  agent_id: AgentId;
  settled: number;
  wins: number;
  losses: number;
  breakeven: number;
  total_pnl: number;
  open_count: number;
}

const COLUMNS =
  'id,agent_id,contract_ticker,side,entry_price,size,entered_at,settled_at,settle_price,pnl,move_used,created_at';

const ZERO_LIFETIME: Omit<LifetimeStatsRow, 'agent_id'> = {
  settled: 0,
  wins: 0,
  losses: 0,
  breakeven: 0,
  total_pnl: 0,
  open_count: 0,
};

function lowerBoundFor(window: PerformanceWindow): string | null {
  if (window === 'lifetime') return null;
  const now = Date.now();
  const ms = window === '24h' ? 24 * 3600 * 1000 : 7 * 24 * 3600 * 1000;
  return new Date(now - ms).toISOString();
}

function rowToTradeLogEntry(r: AgentTradeRow): TradeLogEntry | null {
  if (r.settled_at === null || r.pnl === null || r.entry_price === null || r.settle_price === null) {
    return null;
  }
  return {
    id: r.id,
    contract_ticker: r.contract_ticker,
    side: r.side,
    entry_price_cents: r.entry_price,
    size: r.size,
    entered_at: r.entered_at,
    settled_at: r.settled_at,
    settle_price_cents: r.settle_price,
    pnl: r.pnl,
    move_used: r.move_used,
  };
}

function buildAgent(
  id: AgentId,
  lifetime: LifetimeStatsRow,
  latestReceipt: AgentTradeRow | null,
  openPos: OpenPosition | null,
): Agent {
  const meta = AGENT_META[id];
  const latest_receipt: Receipt | null =
    latestReceipt && latestReceipt.settled_at !== null && latestReceipt.pnl !== null
      ? {
          id: `${id.toUpperCase().slice(0, 3)}-${latestReceipt.id.slice(0, 8).toUpperCase()}`,
          contract_ticker: latestReceipt.contract_ticker,
          side: latestReceipt.side,
          entry_price_cents: latestReceipt.entry_price ?? 0,
          settle_price_cents: latestReceipt.settle_price ?? 0,
          size: latestReceipt.size,
          pnl: latestReceipt.pnl,
          settled_at: latestReceipt.settled_at,
        }
      : null;

  return {
    id,
    name: meta.name,
    nickname: meta.nickname,
    market_label: meta.market_label,
    sprite_url: meta.sprite_url,
    total_pnl: lifetime.total_pnl,
    record: { W: lifetime.wins, L: lifetime.losses, BE: lifetime.breakeven, settled: lifetime.settled },
    brier_7d: { value: 0, n: 0 },
    cities_or_tags: meta.cities_or_tags,
    moves: meta.moves,
    open_position: openPos,
    latest_receipt,
    state: lifetime.settled > 0 ? 'live' : 'pending',
  };
}

export interface AgentCardViewModel {
  total_pnl: number;
  record: { W: number; L: number; BE: number; settled: number };
  tradeLog: TradeLogEntry[];        // capped at 25 for display
  windowSettledCount: number;       // full count from the window's settled rows
}

export interface UseAgentDataResult {
  data: LeaderboardResponse;
  cardViewModels: Record<AgentId, AgentCardViewModel>;
  source: Source;
  error: string | null;
  loading: boolean;
}

interface PerAgentCache {
  window: PerformanceWindow;
  vm: AgentCardViewModel;
}

const EMPTY_VM: AgentCardViewModel = {
  total_pnl: 0,
  record: { W: 0, L: 0, BE: 0, settled: 0 },
  tradeLog: [],
  windowSettledCount: 0,
};

// Empty placeholder for the live-config initial state. Avoids the brief
// mock-data flash on first render when Supabase IS configured: useEffect
// fetches async (~100-300ms), and prior to that the displayed values would
// otherwise be mockLeaderboard's lifetime values (e.g., Apex $18.42 / 52.5%
// WR / In Battle pill — none of which match live state). Empty placeholder
// renders blank until live data resolves; mock path (Supabase unconfigured)
// keeps using mockLeaderboard + mockCardViewModels.
const EMPTY_CARD_VIEW_MODELS: Record<AgentId, AgentCardViewModel> = {
  apex: EMPTY_VM,
  gale: EMPTY_VM,
  metheus: EMPTY_VM,
};

function makeEmptyLeaderboard(): LeaderboardResponse {
  // Use current timestamp so the "Updated Xm ago" header renders as "0m ago"
  // during the brief initial-load window, NOT "NaNm ago" (which is what an
  // empty-string updated_at parses to via new Date('')).
  return { updated_at: new Date().toISOString(), agents: [] };
}

export function useAgentData(
  windowsByAgent: Record<AgentId, PerformanceWindow>,
): UseAgentDataResult {
  // Lazy useState initializers so makeEmptyLeaderboard() runs once at mount,
  // not on every render.
  const [data, setData] = useState<LeaderboardResponse>(
    () => (isSupabaseConfigured ? makeEmptyLeaderboard() : mockLeaderboard),
  );
  const [cardViewModels, setCardViewModels] = useState<Record<AgentId, AgentCardViewModel>>(
    () => (isSupabaseConfigured ? EMPTY_CARD_VIEW_MODELS : mockCardViewModels),
  );
  const [source, setSource] = useState<Source>('mock');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(isSupabaseConfigured);

  // Per-agent fetch cache keyed by [agentId, window]. Memoized so a window flip
  // on Apex does NOT trigger a refetch on Gale/Metheus. The ref outlives renders;
  // the effect only re-runs queries for agents whose window changed.
  const cacheRef = useRef<Partial<Record<AgentId, PerAgentCache>>>({});

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase not configured — using mock data');
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // --- Lifetime aggregate (single query for all agents) ---
        const { data: lifetimeRows, error: lifetimeErr } = await supabase!
          .from('agent_lifetime_stats')
          .select('*');
        if (lifetimeErr) throw lifetimeErr;

        const lifetimeByAgent: Record<AgentId, LifetimeStatsRow> = {} as Record<AgentId, LifetimeStatsRow>;
        for (const id of AGENT_IDS) {
          const row = (lifetimeRows ?? []).find((r) => r.agent_id === id) as LifetimeStatsRow | undefined;
          // Brand-new agent with zero rows in agent_trades_public produces no
          // row from `group by agent_id`. Fall back to the zeroed shape.
          lifetimeByAgent[id] = row ?? { agent_id: id, ...ZERO_LIFETIME };
        }

        // --- Per-agent: latest receipt + open position + per-window log/stats ---
        const agents = await Promise.all(
          AGENT_IDS.map(async (id) => {
            const window = windowsByAgent[id] ?? '24h';

            // Latest receipt
            const { data: receiptRows, error: receiptErr } = await supabase!
              .from('agent_trades_public')
              .select(COLUMNS)
              .eq('agent_id', id)
              .not('pnl', 'is', null)
              .order('settled_at', { ascending: false })
              .limit(1);
            if (receiptErr) throw receiptErr;
            const latestReceipt = (receiptRows?.[0] as AgentTradeRow | undefined) ?? null;

            // Open position — separate query, server-side null filter, ordered by entered_at DESC
            const { data: openRows, error: openErr } = await supabase!
              .from('agent_trades_public')
              .select(COLUMNS)
              .eq('agent_id', id)
              .is('settled_at', null)
              .is('pnl', null)
              .not('entry_price', 'is', null)
              .order('entered_at', { ascending: false })
              .limit(5);
            if (openErr) throw openErr;
            const eligibleOpens = (openRows ?? []) as AgentTradeRow[];
            const latestOpen = eligibleOpens[0] ?? null;
            if (eligibleOpens.length > 1) {
              // eslint-disable-next-line no-console
              console.warn(`[useAgentData] ${id}: ${eligibleOpens.length} eligible opens; using latest`);
            }
            const open_position: OpenPosition | null = latestOpen
              ? {
                  contract_ticker: latestOpen.contract_ticker,
                  entry_price_cents: latestOpen.entry_price,        // non-null by server filter
                  side: latestOpen.side,
                  size: latestOpen.size,
                  entered_at_delayed: latestOpen.entered_at,
                  settles_at: null,                                  // V1: market metadata source not available
                }
              : null;

            // Per-window card view model (memoized per-agent)
            const cached = cacheRef.current[id];
            let vm: AgentCardViewModel;
            if (cached && cached.window === window) {
              vm = cached.vm;
            } else {
              vm = await fetchCardViewModel(id, window, lifetimeByAgent[id]);
              cacheRef.current[id] = { window, vm };
            }

            return { agent: buildAgent(id, lifetimeByAgent[id], latestReceipt, open_position), vm };
          }),
        );

        if (cancelled) return;

        const newViewModels: Record<AgentId, AgentCardViewModel> = {} as Record<AgentId, AgentCardViewModel>;
        for (const { agent, vm } of agents) {
          newViewModels[agent.id] = vm;
        }

        setData({
          updated_at: new Date().toISOString(),
          agents: agents.map((a) => a.agent),
        });
        setCardViewModels(newViewModels);
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
    // Effect re-runs when ANY agent's window changes; the per-agent cache
    // ensures we only refetch the agent whose window actually flipped.
  }, [windowsByAgent.apex, windowsByAgent.gale, windowsByAgent.metheus]);

  return { data, cardViewModels, source, error, loading };
}

async function fetchCardViewModel(
  id: AgentId,
  window: PerformanceWindow,
  lifetime: LifetimeStatsRow,
): Promise<AgentCardViewModel> {
  if (window === 'lifetime') {
    // Stats from aggregate view (already fetched). Display rows: latest 25 closed.
    const { data: rows, error } = await supabase!
      .from('agent_trades_public')
      .select(COLUMNS)
      .eq('agent_id', id)
      .not('pnl', 'is', null)
      .order('settled_at', { ascending: false })
      .limit(25);
    if (error) throw error;
    const tradeLog = (rows ?? [])
      .map(rowToTradeLogEntry)
      .filter((e): e is TradeLogEntry => e !== null);
    return {
      total_pnl: lifetime.total_pnl,
      record: { W: lifetime.wins, L: lifetime.losses, BE: lifetime.breakeven, settled: lifetime.settled },
      tradeLog,
      windowSettledCount: lifetime.settled,
    };
  }

  // 24h or 7d: fetch all settled rows in window, aggregate client-side. Bounded row counts.
  const lowerBound = lowerBoundFor(window)!;
  const { data: rows, error } = await supabase!
    .from('agent_trades_public')
    .select(COLUMNS)
    .eq('agent_id', id)
    .not('pnl', 'is', null)
    .gte('settled_at', lowerBound)
    .order('settled_at', { ascending: false });
  if (error) throw error;

  const closed = (rows ?? []) as AgentTradeRow[];
  let total_pnl = 0;
  let W = 0;
  let L = 0;
  let BE = 0;
  for (const r of closed) {
    const p = r.pnl ?? 0;
    total_pnl += p;
    if (p > 0) W += 1;
    else if (p < 0) L += 1;
    else BE += 1;
  }
  const tradeLog = closed
    .slice(0, 25)
    .map(rowToTradeLogEntry)
    .filter((e): e is TradeLogEntry => e !== null);

  return {
    total_pnl,
    record: { W, L, BE, settled: closed.length },
    tradeLog,
    windowSettledCount: closed.length,
  };
}

export { EMPTY_VM };
