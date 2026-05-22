import type {
  AgentId,
  AgentLifetimeStats,
  BnfPortfolioPoint,
  BnfPortfolioSeries,
  LeaderboardResponse,
  PerformanceWindow,
  TradeLogEntry,
} from './types';
import type { AgentCardViewModel } from './useAgentData';

const now = Date.now();

export const mockLeaderboard: LeaderboardResponse = {
  updated_at: new Date(now - 2 * 60 * 1000).toISOString(),
  agents: [
    {
      id: 'apex',
      name: 'Apex',
      nickname: 'Tempo Reader',
      market_label: 'Kalshi crypto (KXBTC)',
      sprite_url: '/sprites/apex/rotations/south.png',
      total_pnl: 18.42,
      record: { W: 341, L: 298, BE: 11, settled: 650 },
      brier_7d: { value: 0.212, n: 142 },
      cities_or_tags: ['BTC', 'ETH'],
      moves: [
        { name: 'VR Gate', locked: false },
        { name: 'Momentum Direction', locked: false },
        { name: '???', locked: true },
        { name: '???', locked: true },
      ],
      open_position: {
        contract_ticker: 'KXBTC-26APR21-B67500',
        entry_price_cents: 42,
        side: 'yes',
        size: 12,
        entered_at_delayed: new Date(now - 45 * 60 * 1000).toISOString(),
        settles_at: new Date(now + 6 * 60 * 60 * 1000).toISOString(),
      },
      latest_receipt: {
        id: 'APX-20260421-014',
        contract_ticker: 'KXBTC-26APR20-B72000',
        side: 'no',
        entry_price_cents: 58,
        settle_price_cents: 100,
        size: 8,
        pnl: 33.6,
        settled_at: new Date(now - 18 * 60 * 60 * 1000).toISOString(),
      },
      state: 'live',
    },
    {
      id: 'gale',
      name: 'Gale',
      nickname: 'Weather Whisperer',
      market_label: 'Kalshi weather (KXHIGH)',
      sprite_url: '/sprites/gale/rotations/south.png',
      total_pnl: -22.89,
      record: { W: 22, L: 57, BE: 1, settled: 80 },
      brier_7d: { value: 0.088, n: 17 },
      cities_or_tags: ['MIA', 'LAX', 'NYC', 'CHI', 'DEN'],
      moves: [
        { name: 'Normal CDF', locked: false },
        { name: 'Seasonal Bias', locked: false },
        { name: '???', locked: true },
        { name: '???', locked: true },
      ],
      open_position: null,
      latest_receipt: {
        id: 'GAL-20260421-014',
        contract_ticker: 'KXHIGHMIA-26APR19-B85',
        side: 'yes',
        entry_price_cents: 29,
        settle_price_cents: 0,
        size: 3,
        pnl: -0.87,
        settled_at: new Date(now - 36 * 60 * 60 * 1000).toISOString(),
      },
      state: 'live',
    },
    {
      id: 'metheus',
      name: 'Metheus',
      nickname: 'Long Arc',
      market_label: 'TBD',
      sprite_url: '/sprites/metheus/rotations/south.png',
      total_pnl: 0,
      record: { W: 0, L: 0, BE: 0, settled: 0 },
      brier_7d: { value: 0, n: 0 },
      cities_or_tags: [],
      moves: [],
      open_position: {
        contract_ticker: 'KXTECHEARN-26Q2',
        entry_price_cents: 67,
        side: 'yes',
        size: 25,
        entered_at_delayed: new Date(now - 45 * 60 * 1000).toISOString(),
        settles_at: null,
      },
      latest_receipt: null,
      state: 'arriving_soon',
    },
    {
      id: 'bacon',
      name: 'Bacon',
      nickname: 'Chef Pig',
      market_label: 'Kalshi BTC 15m live canary',
      sprite_url: '/world-v2/actors/bacon-idle.png',
      total_pnl: 0,
      record: { W: 0, L: 0, BE: 0, settled: 0 },
      brier_7d: { value: 0, n: 0 },
      cities_or_tags: ['BTC', 'Canary'],
      moves: [
        { name: 'Kitchen Edge', locked: false },
        { name: 'Produce Prep', locked: false },
        { name: '???', locked: true },
        { name: '???', locked: true },
      ],
      open_position: null,
      latest_receipt: null,
      state: 'pending',
    },
    {
      id: 'nova',
      name: 'Nova',
      nickname: 'Celestial Phoenix',
      market_label: 'Kalshi ETH 15m (Nova)',
      sprite_url: '/world-v2/actors/nova-idle.png',
      total_pnl: 12.8,
      record: { W: 8, L: 5, BE: 0, settled: 13 },
      brier_7d: { value: 0, n: 0 },
      cities_or_tags: ['ETH', '15m'],
      moves: [
        { name: 'Astral Drift', locked: false },
        { name: 'Moonline Read', locked: false },
        { name: '???', locked: true },
        { name: '???', locked: true },
      ],
      open_position: null,
      latest_receipt: {
        id: 'NOV-20260522-013',
        contract_ticker: 'KXETH-26MAY22-B3750',
        side: 'yes',
        entry_price_cents: 45,
        settle_price_cents: 100,
        size: 2,
        pnl: 1.1,
        settled_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      },
      state: 'live',
    },
  ],
};

const TICKERS = ['KXFEDDECISION-26MAY', 'KXNYCMAYOR-26NOV', 'KXTECHEARN-26Q2'];

function makeRow(
  id: string,
  agentId: AgentId,
  hoursAgo: number,
  pnl: number,
  side: 'yes' | 'no' = 'yes',
): TradeLogEntry {
  const settledAt = new Date(Date.now() - hoursAgo * 3600 * 1000);
  const enteredAt = new Date(settledAt.getTime() - 30 * 60 * 1000); // 30-min holding default
  const ticker = TICKERS[Math.floor(Math.abs(pnl)) % TICKERS.length];
  return {
    id: `${agentId}-${id.padStart(8, '0')}`,
    contract_ticker: ticker,
    side,
    entry_price_cents: 67,
    size: 25,
    entered_at: enteredAt.toISOString(),
    settled_at: settledAt.toISOString(),
    settle_price_cents: pnl >= 0 ? 71 : 64,
    pnl,
    move_used: null,
  };
}

function generateLog(agentId: AgentId): TradeLogEntry[] {
  const rows: TradeLogEntry[] = [];
  // 24h: 3+ rows distributed within 24h
  for (let i = 0; i < 4; i++) {
    rows.push(makeRow(`24h${i}`, agentId, 1 + i * 5, (i % 2 === 0 ? 1 : -1) * (1 + i * 0.5)));
  }
  // 24h-7d window: ~9 more so 7d total = ~13
  for (let i = 0; i < 9; i++) {
    rows.push(makeRow(`7d${i}`, agentId, 25 + i * 12, (i % 3 === 0 ? -1 : 1) * (2 + i * 0.3)));
  }
  // 7d-lifetime: ~37 more so lifetime total = ~50
  for (let i = 0; i < 37; i++) {
    rows.push(makeRow(`life${i}`, agentId, 7 * 24 + 6 + i * 24, (i % 4 === 0 ? -1 : 1) * (1 + (i % 5))));
  }
  // Sort newest-first
  rows.sort((a, b) => new Date(b.settled_at).getTime() - new Date(a.settled_at).getTime());
  return rows;
}

export const mockTradeLog: Record<AgentId, TradeLogEntry[]> = {
  apex: generateLog('apex'),
  gale: generateLog('gale'),
  metheus: generateLog('metheus'),
  bacon: generateLog('bacon'),
  nova: generateLog('nova'),
};

function aggregate(rows: TradeLogEntry[], hoursWindow: number | null) {
  const cutoff = hoursWindow !== null ? Date.now() - hoursWindow * 3600 * 1000 : null;
  const inWindow = cutoff === null
    ? rows
    : rows.filter((r) => new Date(r.settled_at).getTime() >= cutoff);
  let total_pnl = 0;
  let W = 0;
  let L = 0;
  let BE = 0;
  for (const r of inWindow) {
    total_pnl += r.pnl;
    if (r.pnl > 0) W += 1;
    else if (r.pnl < 0) L += 1;
    else BE += 1;
  }
  return { total_pnl, record: { W, L, BE, settled: inWindow.length }, inWindow };
}

function windowToHours(window: PerformanceWindow): number | null {
  if (window === 'lifetime') return null;
  if (window === '7d') return 7 * 24;
  return 24; // '24h'
}

export function buildMockCardViewModel(
  agentId: AgentId,
  window: PerformanceWindow,
): AgentCardViewModel {
  const { total_pnl, record, inWindow } = aggregate(
    mockTradeLog[agentId],
    windowToHours(window),
  );
  return {
    total_pnl,
    record,
    tradeLog: inWindow.slice(0, 25),
    windowSettledCount: inWindow.length,
  };
}

export const mockCardViewModels: Record<AgentId, AgentCardViewModel> = {
  apex: buildMockCardViewModel('apex', '24h'),
  gale: buildMockCardViewModel('gale', '24h'),
  metheus: buildMockCardViewModel('metheus', '24h'),
  bacon: buildMockCardViewModel('bacon', '24h'),
  nova: buildMockCardViewModel('nova', '24h'),
};

function buildLifetimeStats(agentId: AgentId): AgentLifetimeStats {
  const { total_pnl, record } = aggregate(mockTradeLog[agentId], null);
  // Derive open_count from mockLeaderboard so a future shift in mock open
  // positions (e.g., adding/removing one for Gale) propagates automatically
  // without hardcoded edits here.
  const hasOpen = mockLeaderboard.agents.find((a) => a.id === agentId)?.open_position != null;
  return {
    agent_id: agentId,
    settled: record.settled,
    wins: record.W,
    losses: record.L,
    breakeven: record.BE,
    total_pnl,
    open_count: hasOpen ? 1 : 0,
  };
}

export const mockLifetimeStats: Record<AgentId, AgentLifetimeStats> = {
  apex: buildLifetimeStats('apex'),
  gale: buildLifetimeStats('gale'),
  metheus: buildLifetimeStats('metheus'),
  bacon: buildLifetimeStats('bacon'),
  nova: buildLifetimeStats('nova'),
};

function generateBnfSeries(): BnfPortfolioSeries {
  const points: BnfPortfolioPoint[] = [];
  const baseline = 680000; // $6,800 combined (accounts.yaml today)
  for (let i = 47; i >= 0; i--) {
    const t = new Date(now - i * 3600 * 1000 - 35 * 60 * 1000); // each ≥30-min delayed
    const drift = Math.round(Math.sin((47 - i) / 6) * 4000) + (47 - i) * 250;
    const combined = baseline + drift;
    points.push({
      captured_at: t.toISOString(),
      combined_cleared_cents: combined,
      combined_baseline_cents: baseline,
      brandon_source: 'kalshi',
      justin_source: 'reconstructed',
      is_partial: false,
      pct_vs_baseline: Math.round((combined / baseline - 1) * 10000) / 100,
    });
  }
  return { points, updated_at: points[points.length - 1].captured_at };
}

export const mockBnfPortfolioSeries: BnfPortfolioSeries = generateBnfSeries();
