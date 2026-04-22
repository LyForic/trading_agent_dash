export type AgentId = 'apex' | 'gale' | 'metheus';

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
  entry_price_cents: number;
  side: 'yes' | 'no';
  size: number;
  entered_at_delayed: string; // ISO timestamp, must be >= 30 min ago per delay policy
  settles_at: string;
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

export interface Agent {
  id: AgentId;
  name: string;
  nickname: string;
  market_label: string;
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
