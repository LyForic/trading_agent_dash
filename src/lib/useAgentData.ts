import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from './supabase';
import { AGENT_META, AGENT_IDS } from './agentMeta';
import { mockLeaderboard, mockCardViewModels, buildMockCardViewModel, mockTradeLog } from './mockData';
import type {
  Agent,
  AgentId,
  LeaderboardResponse,
  OpenPosition,
  PerformanceWindow,
  Receipt,
  TradeLogEntry,
  TradeReplayTick,
} from './types';

type Source = 'live' | 'mock';

export type AgentDataError =
  | { kind: 'not-configured'; message: string }
  | { kind: 'fetch-failed'; message: string };

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

interface TradeReplayTickRow {
  trade_id: string;
  captured_at: string;
  yes_price_cents: number | null;
  no_price_cents: number | null;
  underlying_label: string | null;
  underlying_value: number | string | null;
  underlying_unit: string | null;
  source: string | null;
}

const COLUMNS =
  'id,agent_id,contract_ticker,side,entry_price,size,entered_at,settled_at,settle_price,pnl,move_used';
const LIFETIME_COLUMNS = 'agent_id,settled,wins,losses,breakeven,total_pnl,open_count';
const REPLAY_TICK_COLUMNS =
  'trade_id,captured_at,yes_price_cents,no_price_cents,underlying_label,underlying_value,underlying_unit,source';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const AGENT_DATA_REFRESH_MS = 90_000;

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

function rowToReplayTick(row: TradeReplayTickRow): TradeReplayTick | null {
  const yes = row.yes_price_cents ?? (row.no_price_cents === null ? null : 100 - row.no_price_cents);
  const no = row.no_price_cents ?? (yes === null ? null : 100 - yes);
  if (yes === null || no === null) return null;
  const underlyingValue =
    typeof row.underlying_value === 'string'
      ? Number(row.underlying_value)
      : row.underlying_value;

  return {
    captured_at: row.captured_at,
    yes_price_cents: yes,
    no_price_cents: no,
    underlying_label: row.underlying_label,
    underlying_value: typeof underlyingValue === 'number' && Number.isFinite(underlyingValue) ? underlyingValue : null,
    underlying_unit: row.underlying_unit,
    source: row.source ?? 'trading_bot',
  };
}

async function attachReplayTicks(tradeLog: TradeLogEntry[]): Promise<TradeLogEntry[]> {
  if (tradeLog.length === 0) return tradeLog;
  const tradeIds = tradeLog.map((trade) => trade.id);
  const { data, error } = await supabase!
    .from('agent_trade_replay_ticks_public')
    .select(REPLAY_TICK_COLUMNS)
    .in('trade_id', tradeIds)
    .order('captured_at', { ascending: true });

  if (error) {
    console.warn(`[useAgentData] replay ticks unavailable; falling back to modeled replay: ${error.message}`);
    return tradeLog;
  }

  const ticksByTrade = new Map<string, TradeReplayTick[]>();
  for (const row of (data ?? []) as TradeReplayTickRow[]) {
    const tick = rowToReplayTick(row);
    if (!tick) continue;
    const existing = ticksByTrade.get(row.trade_id) ?? [];
    existing.push(tick);
    ticksByTrade.set(row.trade_id, existing);
  }

  return tradeLog.map((trade) => {
    const replay_ticks = ticksByTrade.get(trade.id);
    return replay_ticks && replay_ticks.length > 0 ? { ...trade, replay_ticks } : trade;
  });
}

export function isPublicTradeId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export async function fetchPublicTradeById(agentId: AgentId, tradeId: string): Promise<TradeLogEntry | null> {
  if (!isSupabaseConfigured || !supabase) {
    return mockTradeLog[agentId]?.find((trade) => trade.id === tradeId) ?? null;
  }
  if (!isPublicTradeId(tradeId)) return null;

  const { data, error } = await supabase
    .from('agent_trades_public')
    .select(COLUMNS)
    .eq('agent_id', agentId)
    .eq('id', tradeId)
    .not('pnl', 'is', null)
    .limit(1);

  if (error) {
    console.warn(`[useAgentData] trade ${tradeId} unavailable; deep link will fall back: ${error.message}`);
    return null;
  }

  const trade = ((data ?? []) as AgentTradeRow[])
    .map(rowToTradeLogEntry)
    .find((entry): entry is TradeLogEntry => entry !== null) ?? null;
  if (!trade) return null;

  return (await attachReplayTicks([trade]))[0] ?? trade;
}

export async function fetchPublicTradesInRange(
  agentIds: AgentId[],
  startIso: string,
  endIso: string,
): Promise<Partial<Record<AgentId, TradeLogEntry[]>>> {
  const startTime = Date.parse(startIso);
  const endTime = Date.parse(endIso);

  if (!isSupabaseConfigured || !supabase) {
    return agentIds.reduce<Partial<Record<AgentId, TradeLogEntry[]>>>((acc, agentId) => {
      acc[agentId] = (mockTradeLog[agentId] ?? []).filter((trade) => {
        const settledTime = Date.parse(trade.settled_at);
        return Number.isFinite(settledTime) && settledTime >= startTime && settledTime < endTime;
      });
      return acc;
    }, {});
  }

  const { data, error } = await supabase
    .from('agent_trades_public')
    .select(COLUMNS)
    .in('agent_id', agentIds)
    .not('pnl', 'is', null)
    .gte('settled_at', startIso)
    .lt('settled_at', endIso)
    .order('settled_at', { ascending: false })
    .limit(500);

  if (error) throw error;

  const parsedRows = ((data ?? []) as AgentTradeRow[])
    .map((row) => ({ agentId: row.agent_id, trade: rowToTradeLogEntry(row) }))
    .filter((row): row is { agentId: AgentId; trade: TradeLogEntry } => row.trade !== null);
  const tradesWithReplay = await attachReplayTicks(parsedRows.map((row) => row.trade));
  const replayByTradeId = new Map(tradesWithReplay.map((trade) => [trade.id, trade]));

  return parsedRows.reduce<Partial<Record<AgentId, TradeLogEntry[]>>>((acc, row) => {
    const rowsForAgent = acc[row.agentId] ?? [];
    rowsForAgent.push(replayByTradeId.get(row.trade.id) ?? row.trade);
    acc[row.agentId] = rowsForAgent;
    return acc;
  }, {});
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
  error: AgentDataError | null;
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
  bacon: EMPTY_VM,
  nova: EMPTY_VM,
  meridian: EMPTY_VM,
};

function makeEmptyLeaderboard(): LeaderboardResponse {
  // Use current timestamp so the "Updated Xm ago" header renders as "0m ago"
  // during the brief initial-load window, NOT "NaNm ago" (which is what an
  // empty-string updated_at parses to via new Date('')).
  return { updated_at: new Date().toISOString(), agents: [] };
}

function latestValidIso(values: Array<string | null | undefined>) {
  let latestMs = Number.NEGATIVE_INFINITY;
  let latestIso: string | null = null;

  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isFinite(time) || time <= latestMs) continue;
    latestMs = time;
    latestIso = value;
  }

  return latestIso;
}

function leaderboardUpdatedAt(agents: Agent[]) {
  return latestValidIso(
    agents.flatMap((agent) => [
      agent.latest_receipt?.settled_at,
      agent.open_position?.entered_at_delayed,
    ]),
  ) ?? new Date().toISOString();
}

export function useAgentData(
  windowsByAgent: Record<AgentId, PerformanceWindow>,
): UseAgentDataResult {
  // Lazy useState initializers so makeEmptyLeaderboard() runs once at mount,
  // not on every render. Unconfigured-mode initial state is set here rather
  // than in a useEffect so we avoid set-state-in-effect anti-pattern.
  const [data, setData] = useState<LeaderboardResponse>(
    () => (isSupabaseConfigured ? makeEmptyLeaderboard() : mockLeaderboard),
  );
  const [liveCardViewModels, setLiveCardViewModels] = useState<Record<AgentId, AgentCardViewModel>>(
    () => (isSupabaseConfigured ? EMPTY_CARD_VIEW_MODELS : mockCardViewModels),
  );
  const [source, setSource] = useState<Source>(() => (isSupabaseConfigured ? 'live' : 'mock'));
  const [error, setError] = useState<AgentDataError | null>(
    () =>
      isSupabaseConfigured
        ? null
        : { kind: 'not-configured', message: 'Supabase not configured — using mock data' },
  );
  const [loading, setLoading] = useState<boolean>(() => isSupabaseConfigured);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const windowSignature = AGENT_IDS.map((id) => windowsByAgent[id] ?? '24h').join('|');

  // Mock-mode: card view models recompute reactively when windowsByAgent changes.
  // In live mode this memo is unused (liveCardViewModels comes from the async effect).
  const mockCardViewModelsByWindow = useMemo<Record<AgentId, AgentCardViewModel>>(() => {
    if (isSupabaseConfigured) return EMPTY_CARD_VIEW_MODELS;
    return AGENT_IDS.reduce<Record<AgentId, AgentCardViewModel>>((acc, id) => {
      acc[id] = buildMockCardViewModel(id, windowsByAgent[id] ?? '24h');
      return acc;
    }, {} as Record<AgentId, AgentCardViewModel>);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSignature]);

  const cardViewModels = isSupabaseConfigured ? liveCardViewModels : mockCardViewModelsByWindow;

  // Per-agent fetch cache keyed by [agentId, window]. Memoized so a window flip
  // on Apex does NOT trigger a refetch on Gale/Metheus. The ref outlives renders;
  // the effect only re-runs queries for agents whose window changed.
  const cacheRef = useRef<Partial<Record<AgentId, PerAgentCache>>>({});

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    const requestRefresh = () => {
      if (document.visibilityState === 'hidden') return;
      cacheRef.current = {};
      setRefreshNonce((value) => value + 1);
    };

    const refresh = window.setInterval(requestRefresh, AGENT_DATA_REFRESH_MS);
    window.addEventListener('focus', requestRefresh);
    document.addEventListener('visibilitychange', requestRefresh);

    return () => {
      window.clearInterval(refresh);
      window.removeEventListener('focus', requestRefresh);
      document.removeEventListener('visibilitychange', requestRefresh);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;

    let cancelled = false;
    // Intentional: setLoading(true) opens the async fetch cycle; setLoading(false)
    // always closes it in the same IIFE's success and catch paths.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    (async () => {
      try {
        // --- Lifetime aggregate (single query for all agents) ---
        const { data: lifetimeRows, error: lifetimeErr } = await supabase!
          .from('agent_lifetime_stats')
          .select(LIFETIME_COLUMNS);
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
            // Multiple delayed open rows can exist while separate contracts are
            // still unsettled. Public UI shows one deterministic "In Battle"
            // receipt: newest entered_at first from the ordered query above.
            const latestOpen = eligibleOpens[0] ?? null;
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
          updated_at: leaderboardUpdatedAt(agents.map((a) => a.agent)),
          agents: agents.map((a) => a.agent),
        });
        setLiveCardViewModels(newViewModels);
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
  // Effect re-runs when ANY agent's window changes; the per-agent cache
  // ensures we only refetch the agent whose window actually flipped.
  // windowsByAgent object ref changes every render in callers; windowSignature
  // keeps this dependency stable unless an agent's selected window changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowSignature, refreshNonce]);

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
      tradeLog: await attachReplayTicks(tradeLog),
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
    tradeLog: await attachReplayTicks(tradeLog),
    windowSettledCount: closed.length,
  };
}

export { EMPTY_VM };
