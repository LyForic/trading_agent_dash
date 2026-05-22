export type AgentId = 'apex' | 'gale' | 'metheus' | 'bacon' | 'nova';

export type PerformanceWindow = '24h' | '7d' | 'lifetime';

export interface Move {
  name: string;
  locked: boolean;
}

export interface Record {
  W: number;
  L: number;
  BE: number;
  settled: number;
}

export interface BrierScore {
  value: number;
  n: number;
}

export interface OpenPosition {
  contract_ticker: string;
  entry_price_cents: number | null;  // nullable for type completeness; data layer suppresses null rows
  side: 'yes' | 'no';
  size: number;
  entered_at_delayed: string; // ISO timestamp, must be >= 30 min ago per delay policy
  settles_at: string | null;          // nullable: "In Battle" without countdown when unknown
}

export interface Receipt {
  id: string;
  contract_ticker: string;
  side: 'yes' | 'no';
  entry_price_cents: number;
  settle_price_cents: number;
  size: number;
  pnl: number;
  settled_at: string;
}

export interface TradeLogEntry {
  id: string;
  contract_ticker: string;
  side: 'yes' | 'no';
  entry_price_cents: number;     // present (non-null) — open rows excluded from log
  size: number;
  entered_at: string;
  settled_at: string;            // present (non-null)
  settle_price_cents: number;
  pnl: number;
  move_used: string | null;
  replay_ticks?: TradeReplayTick[];
}

export interface TradeReplayTick {
  captured_at: string;            // ISO timestamp, delayed by the public view
  yes_price_cents: number;
  no_price_cents: number;
  underlying_label: string | null;
  underlying_value: number | null;
  underlying_unit: string | null;
  source: string;
}

export interface AgentLifetimeStats {
  agent_id: AgentId;
  settled: number;
  wins: number;
  losses: number;
  breakeven: number;
  total_pnl: number;
  open_count: number;
}

export interface Agent {
  id: AgentId;
  name: string;
  nickname: string;
  market_label: string;
  sprite_url?: string; // public asset path; AgentAvatar falls back to color silhouette if absent
  total_pnl: number;
  record: Record;
  brier_7d: BrierScore;
  cities_or_tags: string[];
  moves: Move[];
  open_position: OpenPosition | null;
  latest_receipt: Receipt | null; // V1 embeds; V1.1 adds /trade/:id route with replay
  state: 'live' | 'pending' | 'arriving_soon';
}

export interface LeaderboardResponse {
  updated_at: string;
  agents: Agent[];
}

export interface Snapshot {
  ts: string;
  midprice_cents: number;
  probability_yes: number;
  pnl_unrealized: number;
}

export interface BnfPortfolioPoint {
  captured_at: string;            // ISO timestamp (already 30-min delayed by the view)
  combined_cleared_cents: number;
  combined_baseline_cents: number;
  brandon_source: 'kalshi' | 'reconstructed';
  justin_source: 'kalshi' | 'reconstructed';
  is_partial: boolean;
  pct_vs_baseline: number;        // percent, 2dp, from the view
}

export interface BnfPortfolioSeries {
  points: BnfPortfolioPoint[];
  updated_at: string;             // ISO; latest point's captured_at or fetch time
}
