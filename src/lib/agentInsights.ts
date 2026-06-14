import { formatPnl } from './formatting';
import type { AgentId, TradeLogEntry } from './types';

export type AgentTradeInsightKind =
  | 'choppy_probability_path'
  | 'cohort_drag'
  | 'entry_timing'
  | 'single_trade_drag'
  | 'side_split'
  | 'small_sample'
  | (string & {});

export type AgentTradeInsightConfidence = 'low' | 'medium' | 'high';

export interface AgentTradeInsight {
  id?: string;
  kind: AgentTradeInsightKind;
  agentId: AgentId;
  headline: string;
  summary: string;
  evidence: string;
  evidenceBullets?: string[];
  nextRule: string;
  confidence: AgentTradeInsightConfidence;
  settledCount: number;
  sampleSize?: number;
  tradeIds: string[];
  signalIds?: string[];
  sourceRefs?: string[];
  sourceLabel?: string;
  generatedBy?: string;
  generatedAt?: string;
  windowStart?: string;
  windowEnd?: string;
  insightDate?: string;
}

interface ScoredAgentTradeInsight extends AgentTradeInsight {
  score: number;
}

interface SideStats {
  side: 'yes' | 'no';
  count: number;
  pnl: number;
}

interface ReplayShape {
  trade: TradeLogEntry;
  rangeCents: number;
  netCents: number;
  efficiency: number;
}

interface AgentTradeSummary {
  agentId: AgentId;
  trades: TradeLogEntry[];
  settledCount: number;
  totalPnl: number;
  losses: TradeLogEntry[];
  wins: TradeLogEntry[];
  lossTotal: number;
  worstTrade: TradeLogEntry | null;
  sideStats: SideStats[];
  replayShapes: ReplayShape[];
}

const HIGH_ENTRY_CENTS = 65;
const MIN_ACTIONABLE_LOSS = 10;
const CHOP_RANGE_CENTS = 10;
const CHOP_EFFICIENCY = 0.35;

function agentLabel(agentId: AgentId) {
  return agentId.charAt(0).toUpperCase() + agentId.slice(1);
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatCents(value: number) {
  return `${Math.round(value)}c`;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function confidenceFor(settledCount: number): AgentTradeInsightConfidence {
  if (settledCount >= 12) return 'high';
  if (settledCount >= 5) return 'medium';
  return 'low';
}

function selectedTickPrice(trade: TradeLogEntry, tick: NonNullable<TradeLogEntry['replay_ticks']>[number]) {
  return trade.side === 'yes' ? tick.yes_price_cents : tick.no_price_cents;
}

function replayShapeFor(trade: TradeLogEntry): ReplayShape | null {
  const ticks = (trade.replay_ticks ?? [])
    .filter((tick) => Number.isFinite(Date.parse(tick.captured_at)))
    .slice()
    .sort((a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at));

  if (ticks.length < 3) return null;

  const prices = ticks.map((tick) => selectedTickPrice(trade, tick));
  const first = prices[0];
  const last = prices[prices.length - 1];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const rangeCents = max - min;

  if (rangeCents <= 0) return null;

  const netCents = last - first;
  return {
    trade,
    rangeCents,
    netCents,
    efficiency: Math.abs(netCents) / rangeCents,
  };
}

function summarizeAgentTrades(agentId: AgentId, rows: TradeLogEntry[]): AgentTradeSummary {
  const trades = rows
    .filter((trade) => Number.isFinite(trade.pnl))
    .slice()
    .sort((a, b) => Date.parse(b.settled_at) - Date.parse(a.settled_at));
  const losses = trades.filter((trade) => trade.pnl < 0);
  const wins = trades.filter((trade) => trade.pnl > 0);
  const lossTotal = Math.abs(losses.reduce((sum, trade) => sum + trade.pnl, 0));
  const worstTrade = losses.reduce<TradeLogEntry | null>((worst, trade) => {
    if (!worst) return trade;
    return trade.pnl < worst.pnl ? trade : worst;
  }, null);
  const sideStats: SideStats[] = (['yes', 'no'] as const).map((side) => {
    const sideTrades = trades.filter((trade) => trade.side === side);
    return {
      side,
      count: sideTrades.length,
      pnl: sideTrades.reduce((sum, trade) => sum + trade.pnl, 0),
    };
  });

  return {
    agentId,
    trades,
    settledCount: trades.length,
    totalPnl: trades.reduce((sum, trade) => sum + trade.pnl, 0),
    losses,
    wins,
    lossTotal,
    worstTrade,
    sideStats,
    replayShapes: trades
      .map(replayShapeFor)
      .filter((shape): shape is ReplayShape => shape !== null),
  };
}

function singleTradeDragInsight(summary: AgentTradeSummary): ScoredAgentTradeInsight | null {
  const { agentId, lossTotal, settledCount, worstTrade } = summary;
  if (!worstTrade || lossTotal < MIN_ACTIONABLE_LOSS) return null;

  const lossShare = Math.abs(worstTrade.pnl) / lossTotal;
  if (lossShare < 0.5 && Math.abs(worstTrade.pnl) < 25) return null;

  const name = agentLabel(agentId);
  return {
    kind: 'single_trade_drag',
    agentId,
    headline: `${name}'s drawdown was concentrated in one trade`,
    summary: `${name}'s red window came mostly from one ${worstTrade.side.toUpperCase()} position, so the first review target is sizing and entry quality on that setup.`,
    evidence: `${formatPnl(worstTrade.pnl)} made up ${formatPercent(lossShare)} of ${formatPnl(-lossTotal)} losing P&L across ${settledCount} settled trade${settledCount === 1 ? '' : 's'}.`,
    nextRule: `Replay ${worstTrade.contract_ticker} before changing the whole strategy; cap similar entries when the setup is above ${formatCents(worstTrade.entry_price_cents)} without fresh confirmation.`,
    confidence: confidenceFor(settledCount),
    settledCount,
    tradeIds: [worstTrade.id],
    score: 90 + lossShare * 28 + Math.min(Math.abs(worstTrade.pnl), 80) / 8,
  };
}

function entryTimingInsight(summary: AgentTradeSummary): ScoredAgentTradeInsight | null {
  const lateLosses = summary.losses.filter((trade) => trade.entry_price_cents >= HIGH_ENTRY_CENTS);
  if (lateLosses.length === 0) return null;
  if (lateLosses.length < 2 && Math.abs(lateLosses[0].pnl) < 20) return null;

  const lateLossPnl = lateLosses.reduce((sum, trade) => sum + trade.pnl, 0);
  const avgEntry = average(lateLosses.map((trade) => trade.entry_price_cents));
  const name = agentLabel(summary.agentId);

  return {
    kind: 'entry_timing',
    agentId: summary.agentId,
    headline: `${name} paid up for losing entries`,
    summary: `${name}'s losses clustered after entering expensive contracts, which points to late confirmation rather than a clean directional edge.`,
    evidence: `${lateLosses.length}/${summary.losses.length} losing trade${summary.losses.length === 1 ? '' : 's'} entered at ${HIGH_ENTRY_CENTS}c or higher; those entries averaged ${formatCents(avgEntry)} and produced ${formatPnl(lateLossPnl)}.`,
    nextRule: `Skip or resize entries above ${HIGH_ENTRY_CENTS}c unless the next tick confirms follow-through.`,
    confidence: confidenceFor(summary.settledCount),
    settledCount: summary.settledCount,
    tradeIds: lateLosses.map((trade) => trade.id),
    score: 94 + lateLosses.length * 7 + Math.min(Math.abs(lateLossPnl), 100) / 10,
  };
}

function choppyProbabilityPathInsight(summary: AgentTradeSummary): ScoredAgentTradeInsight | null {
  const choppyLosses = summary.replayShapes.filter(
    (shape) => shape.trade.pnl < 0
      && shape.rangeCents >= CHOP_RANGE_CENTS
      && shape.efficiency <= CHOP_EFFICIENCY,
  );
  if (choppyLosses.length < 2) return null;

  const choppyPnl = choppyLosses.reduce((sum, shape) => sum + shape.trade.pnl, 0);
  const avgRange = average(choppyLosses.map((shape) => shape.rangeCents));
  const avgNet = average(choppyLosses.map((shape) => Math.abs(shape.netCents)));
  const name = agentLabel(summary.agentId);

  return {
    kind: 'choppy_probability_path',
    agentId: summary.agentId,
    headline: `${name} struggled in choppy probability paths`,
    summary: `${name}'s losing trades had wide intratrade swings but little follow-through, which is the pattern a trend rule should avoid.`,
    evidence: `${choppyLosses.length} losing replay${choppyLosses.length === 1 ? '' : 's'} averaged ${formatCents(avgRange)} of range but only ${formatCents(avgNet)} of net movement, for ${formatPnl(choppyPnl)}.`,
    nextRule: `Require cleaner follow-through before entry; treat wide range with low net movement as chop.`,
    confidence: confidenceFor(summary.settledCount),
    settledCount: summary.settledCount,
    tradeIds: choppyLosses.map((shape) => shape.trade.id),
    score: 104 + choppyLosses.length * 8 + Math.min(Math.abs(choppyPnl), 100) / 10,
  };
}

function sideSplitInsight(summary: AgentTradeSummary): ScoredAgentTradeInsight | null {
  const [yesStats, noStats] = summary.sideStats;
  if (yesStats.count < 2 || noStats.count < 2) return null;

  const worse = yesStats.pnl <= noStats.pnl ? yesStats : noStats;
  const better = worse.side === 'yes' ? noStats : yesStats;
  const avgGap = (better.pnl / better.count) - (worse.pnl / worse.count);
  if (worse.pnl >= 0 || avgGap < 5) return null;

  const name = agentLabel(summary.agentId);
  return {
    kind: 'side_split',
    agentId: summary.agentId,
    headline: `${name}'s ${worse.side.toUpperCase()} side lagged`,
    summary: `${name}'s day split by side: ${worse.side.toUpperCase()} trades dragged while ${better.side.toUpperCase()} trades held up better.`,
    evidence: `${worse.side.toUpperCase()} trades: ${worse.count} settled, ${formatPnl(worse.pnl)}. ${better.side.toUpperCase()} trades: ${better.count} settled, ${formatPnl(better.pnl)}.`,
    nextRule: `Review whether ${worse.side.toUpperCase()} entries need a stricter filter before changing both sides of the strategy.`,
    confidence: confidenceFor(summary.settledCount),
    settledCount: summary.settledCount,
    tradeIds: summary.trades.filter((trade) => trade.side === worse.side).map((trade) => trade.id),
    score: 84 + avgGap + Math.min(Math.abs(worse.pnl), 80) / 8,
  };
}

function smallSampleInsight(summary: AgentTradeSummary): ScoredAgentTradeInsight | null {
  if (summary.settledCount === 0 || summary.settledCount >= 3) return null;
  const name = agentLabel(summary.agentId);

  return {
    kind: 'small_sample',
    agentId: summary.agentId,
    headline: `${name} needs more settled trades before changing rules`,
    summary: `${name} only has ${summary.settledCount} settled trade${summary.settledCount === 1 ? '' : 's'} in this window, so this is not enough evidence for a real strategy change.`,
    evidence: `Current window: ${summary.settledCount} settled, ${formatPnl(summary.totalPnl)}.`,
    nextRule: 'Wait for at least 3 to 5 comparable trades before treating this as a pattern.',
    confidence: 'low',
    settledCount: summary.settledCount,
    tradeIds: summary.trades.map((trade) => trade.id),
    score: 10,
  };
}

function bestInsight(candidates: Array<ScoredAgentTradeInsight | null>) {
  return candidates
    .filter((candidate): candidate is ScoredAgentTradeInsight => candidate !== null)
    .sort((a, b) => b.score - a.score)[0] ?? null;
}

export function buildAgentTradeInsight(
  agentId: AgentId,
  rows: TradeLogEntry[],
  options: { includeSmallSample?: boolean } = {},
): AgentTradeInsight | null {
  const summary = summarizeAgentTrades(agentId, rows);
  const insight = bestInsight([
    choppyProbabilityPathInsight(summary),
    entryTimingInsight(summary),
    singleTradeDragInsight(summary),
    sideSplitInsight(summary),
    options.includeSmallSample ? smallSampleInsight(summary) : null,
  ]);

  if (!insight) return null;
  const { score: _score, ...publicInsight } = insight;
  return publicInsight;
}

function cohortDragInsight(summaries: AgentTradeSummary[]): ScoredAgentTradeInsight | null {
  const summariesWithLoss = summaries.filter((summary) => summary.totalPnl < 0);
  const lossTotal = Math.abs(summariesWithLoss.reduce((sum, summary) => sum + summary.totalPnl, 0));
  if (lossTotal < MIN_ACTIONABLE_LOSS) return null;

  const worst = summariesWithLoss.sort((a, b) => a.totalPnl - b.totalPnl)[0];
  if (!worst) return null;

  const lossShare = Math.abs(worst.totalPnl) / lossTotal;
  if (lossShare < 0.55) return null;

  const allSettled = summaries.reduce((sum, summary) => sum + summary.settledCount, 0);
  const name = agentLabel(worst.agentId);

  return {
    kind: 'cohort_drag',
    agentId: worst.agentId,
    headline: `${name} drove most of the account drawdown`,
    summary: `The red day was not evenly spread across the cohort; ${name} contributed most of the losing P&L.`,
    evidence: `${name} finished ${formatPnl(worst.totalPnl)}, which was ${formatPercent(lossShare)} of ${formatPnl(-lossTotal)} losing agent P&L across ${allSettled} settled trade${allSettled === 1 ? '' : 's'}.`,
    nextRule: `Start the review with ${name}'s losing setup before changing all 6 agents.`,
    confidence: confidenceFor(allSettled),
    settledCount: allSettled,
    tradeIds: worst.trades.map((trade) => trade.id),
    score: 78 + lossShare * 22 + Math.min(Math.abs(worst.totalPnl), 100) / 12,
  };
}

export function buildDailyTradeInsight(
  tradeLogsByAgent: Partial<Record<AgentId, TradeLogEntry[]>>,
): AgentTradeInsight | null {
  const summaries = (Object.entries(tradeLogsByAgent) as Array<[AgentId, TradeLogEntry[] | undefined]>)
    .map(([agentId, rows]) => summarizeAgentTrades(agentId, rows ?? []))
    .filter((summary) => summary.settledCount > 0);

  if (summaries.length === 0) return null;

  const candidates: Array<ScoredAgentTradeInsight | null> = [cohortDragInsight(summaries)];
  for (const summary of summaries) {
    candidates.push(
      choppyProbabilityPathInsight(summary),
      entryTimingInsight(summary),
      singleTradeDragInsight(summary),
      sideSplitInsight(summary),
    );
  }

  const insight = bestInsight(candidates);
  if (!insight) return null;
  const { score: _score, ...publicInsight } = insight;
  return publicInsight;
}

export function isActionableTradeInsight(insight: AgentTradeInsight | null): insight is AgentTradeInsight {
  return insight !== null && insight.kind !== 'small_sample' && insight.confidence !== 'low';
}

export function insightEvidenceList(insight: AgentTradeInsight | null) {
  if (!insight) return [];
  const bullets = insight.evidenceBullets
    ?.map((item) => item.trim())
    .filter(Boolean);
  if (bullets && bullets.length > 0) return bullets;
  return insight.evidence ? [insight.evidence] : [];
}

export function insightSampleSize(insight: AgentTradeInsight | null) {
  if (!insight) return 0;
  return insight.sampleSize ?? insight.settledCount;
}
